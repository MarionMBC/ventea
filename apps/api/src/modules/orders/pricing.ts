import { BadRequestException } from '@nestjs/common';
import type { CartLine } from '@ventea/shared';

/**
 * Precio de un pedido calculado SOLO desde el catálogo. Lo que el cliente manda es
 * qué quiere (ítem, cantidad, opciones), nunca cuánto cuesta.
 *
 * Funciones puras: el servicio lee el catálogo y se lo pasa; acá no hay base de datos.
 */

export interface CatalogOption {
  id: string;
  name: string;
  priceDeltaCents: number;
  isAvailable: boolean;
}

export interface CatalogGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: CatalogOption[];
}

export interface CatalogItem {
  id: string;
  name: string;
  basePriceCents: number;
  isAvailable: boolean;
  modifierGroups: CatalogGroup[];
}

export interface PricedOption {
  optionId: string;
  nameSnapshot: string;
  priceDeltaCents: number;
}

export interface PricedLine {
  menuItemId: string;
  nameSnapshot: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  notes: string | null;
  options: PricedOption[];
}

export interface PricedCart {
  lines: PricedLine[];
  subtotalCents: number;
}

/**
 * Valida y pone precio a cada línea:
 *   precio de línea = (basePriceCents + Σ priceDeltaCents de las opciones) × cantidad
 *
 * Rechaza (400) ítems inexistentes o no disponibles, opciones que no pertenecen a un
 * grupo del ítem, opciones agotadas o repetidas y selecciones fuera de min/max.
 */
export function priceCart(
  lines: CartLine[],
  catalog: ReadonlyMap<string, CatalogItem>,
): PricedCart {
  const priced = lines.map((line) => priceLine(line, catalog));
  const subtotalCents = priced.reduce((sum, line) => sum + line.totalCents, 0);
  return { lines: priced, subtotalCents };
}

function priceLine(line: CartLine, catalog: ReadonlyMap<string, CatalogItem>): PricedLine {
  const item = catalog.get(line.menuItemId);
  if (!item || !item.isAvailable) {
    throw new BadRequestException(`Producto no disponible: ${line.menuItemId}`);
  }

  const selected = line.selectedOptionIds ?? [];
  if (new Set(selected).size !== selected.length) {
    throw new BadRequestException(`"${item.name}": opción repetida`);
  }

  const optionGroup = new Map<string, { group: CatalogGroup; option: CatalogOption }>();
  for (const group of item.modifierGroups) {
    for (const option of group.options) optionGroup.set(option.id, { group, option });
  }

  const options: PricedOption[] = [];
  const perGroup = new Map<string, number>();
  for (const optionId of selected) {
    const match = optionGroup.get(optionId);
    if (!match) {
      throw new BadRequestException(`"${item.name}": opción inválida ${optionId}`);
    }
    if (!match.option.isAvailable) {
      throw new BadRequestException(`"${item.name}": "${match.option.name}" no está disponible`);
    }
    perGroup.set(match.group.id, (perGroup.get(match.group.id) ?? 0) + 1);
    options.push({
      optionId: match.option.id,
      nameSnapshot: match.option.name,
      priceDeltaCents: match.option.priceDeltaCents,
    });
  }

  for (const group of item.modifierGroups) {
    const count = perGroup.get(group.id) ?? 0;
    if (count < group.minSelect || count > group.maxSelect) {
      throw new BadRequestException(
        `"${item.name}": "${group.name}" admite entre ${group.minSelect} y ${group.maxSelect} opciones`,
      );
    }
  }

  const unitPriceCents =
    item.basePriceCents + options.reduce((sum, option) => sum + option.priceDeltaCents, 0);
  if (unitPriceCents < 0) {
    // Un delta negativo mal cargado no puede convertir el pedido en un pago al cliente.
    throw new BadRequestException(`"${item.name}": precio inválido`);
  }

  return {
    menuItemId: item.id,
    nameSnapshot: item.name,
    quantity: line.quantity,
    unitPriceCents,
    totalCents: unitPriceCents * line.quantity,
    notes: line.notes ?? null,
    options,
  };
}
