import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { assignRegion, parseRegions, type Region } from './regions';

/** Asigna la región de una marca nueva según `REGIONS` (ver `regions.ts`). */
@Injectable()
export class RegionService {
  private readonly regions: Region[];

  constructor(config: ConfigService) {
    // Falla el arranque si REGIONS está mal escrito.
    this.regions = parseRegions(config.get<string>('REGIONS'));
  }

  assign(countryCode?: string | null): Region {
    return assignRegion(this.regions, countryCode);
  }
}
