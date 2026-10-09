import { useState } from 'react';
import { EmptyState } from '../../components/feedback/EmptyState';
import { CheckboxField } from '../../components/forms/CheckboxField';
import { QuantitySelector } from '../../components/forms/QuantitySelector';
import { RadioGroup } from '../../components/forms/RadioGroup';
import { AddToCartButton } from '../../components/ui/AddToCartButton';
import { Badge } from '../../components/ui/Badge';
import { IconButton } from '../../components/ui/IconButton';
import { ProductImage } from '../../components/ui/ProductImage';
import { Skeleton, SkeletonText } from '../../components/ui/Skeleton';
import { formatPrice } from '../../components/ui/formatPrice';
import { BackHeader } from '../../components/navigation/AppHeader';
import { StickyActionArea } from '../../components/navigation/StickyActionArea';
import { useToast } from '../../components/feedback/toastContext';
import { t } from '../../i18n';
import type { Product, ProductOption, ProductOptionGroup } from '../../types/product';
import { useAppState } from '../appStateContext';
import { defaultOptionIds, fromCents, invalidGroups, lineTotalCents } from '../menu/pricing';
import { useMenu } from '../menu/useMenu';
import { ScreenShell } from './ScreenShell';
import { RetryState } from './ScreenStates';
import './screens.css';

export interface ProductDetailScreenProps {
  /** API menu item id; without one, the first product of the menu is shown. */
  productId?: string;
  embedded?: boolean;
  onBack?: () => void;
}

const priceMeta = (option: ProductOption) =>
  option.soldOut
    ? t('product.soldOut')
    : option.priceDeltaCents === 0
      ? t('product.free')
      : `${option.priceDeltaCents > 0 ? '+' : '-'}${formatPrice(Math.abs(fromCents(option.priceDeltaCents)))}`;

/**
 * Product detail and order customization in one screen: photo, then one
 * control per real modifier group of the item, and a sticky bar that always
 * shows what the tap will cost.
 */
export const ProductDetailScreen = ({
  productId,
  embedded = false,
  onBack,
}: ProductDetailScreenProps) => {
  const { menu, loading, error, retry, findProduct } = useMenu();
  const product = productId ? findProduct(productId) : menu?.products[0];

  if (error || loading || !product) {
    return (
      <ScreenShell header={<BackHeader title={t('tab.menu')} onBack={onBack} flush={embedded} />}>
        <div className="vt-screen__inner">
          {error ? (
            <RetryState title={t('product.loadError')} message={error} onRetry={retry} />
          ) : loading ? (
            <div
              className="vt-stack-3"
              role="status"
              aria-busy="true"
              aria-label={t('a11y.loadingProduct')}
            >
              <Skeleton height="220px" radius="md" />
              <Skeleton width="70%" height="28px" />
              <SkeletonText lines={3} />
            </div>
          ) : (
            <EmptyState
              icon="restaurantOutline"
              title={t('product.notFound')}
              description={t('product.notFoundDescription')}
            />
          )}
        </div>
      </ScreenShell>
    );
  }

  /* Keyed by product: the selection starts from that product's defaults. */
  return <ProductDetail key={product.id} product={product} embedded={embedded} onBack={onBack} />;
};

interface ProductDetailProps {
  product: Product;
  embedded: boolean;
  onBack?: () => void;
}

const ProductDetail = ({ product, embedded, onBack }: ProductDetailProps) => {
  const { addLine, favourites, toggleFavourite } = useAppState();
  const { showToast } = useToast();

  const [optionIds, setOptionIds] = useState<string[]>(() => defaultOptionIds(product));
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  const groups = product.optionGroups ?? [];
  const total = fromCents(lineTotalCents(product, optionIds, quantity));
  const incomplete = invalidGroups(product, optionIds).length > 0;
  const soldOut = Boolean(product.soldOut);

  const inGroup = (group: ProductOptionGroup) =>
    optionIds.filter((id) => group.options.some((option) => option.id === id));

  /** Single-choice groups: the new option replaces whatever the group had. */
  const choose = (group: ProductOptionGroup, optionId: string | undefined) =>
    setOptionIds((current) => [
      ...current.filter((id) => !group.options.some((option) => option.id === id)),
      ...(optionId ? [optionId] : []),
    ]);

  const toggle = (optionId: string) =>
    setOptionIds((current) =>
      current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId],
    );

  const renderGroup = (group: ProductOptionGroup) => {
    const selected = inGroup(group);
    const title = (
      <h2 className="vt-h3">
        {group.name}
        {group.minSelect === 0 && <span className="vt-field__optional"> {t('form.optional')}</span>}
      </h2>
    );

    if (group.kind === 'single') {
      const none = group.minSelect === 0 ? [{ value: '', label: t('product.none') }] : [];
      return (
        <section key={group.id} className="vt-section">
          <RadioGroup
            legend={group.name}
            value={selected[0] ?? ''}
            onChange={(value) => choose(group, value || undefined)}
            options={[
              ...none,
              ...group.options.map((option) => ({
                value: option.id,
                label: option.name,
                meta: priceMeta(option),
                disabled: option.soldOut,
              })),
            ]}
          />
        </section>
      );
    }

    const full = selected.length >= group.maxSelect;
    return (
      <section key={group.id} className="vt-section">
        {title}
        {group.maxSelect > 1 && group.maxSelect < group.options.length && (
          <span className="vt-caption">{t('product.chooseUpTo', { count: group.maxSelect })}</span>
        )}
        <div className="vt-stack-1">
          {group.options.map((option) => {
            const checked = selected.includes(option.id);
            return (
              <CheckboxField
                key={option.id}
                label={option.name}
                meta={priceMeta(option)}
                disabled={option.soldOut || (!checked && full)}
                checked={checked}
                onChange={() => toggle(option.id)}
              />
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <ScreenShell
      footer={
        <StickyActionArea>
          <QuantitySelector
            value={quantity}
            onChange={setQuantity}
            max={99}
            itemLabel={product.name}
          />
          <AddToCartButton
            price={total}
            label={soldOut ? t('product.soldOut') : t('product.add')}
            justAdded={justAdded}
            disabled={soldOut || incomplete}
            onClick={() => {
              addLine(product, { optionIds, quantity });
              setJustAdded(true);
              showToast({
                message: t('product.addedToast', { name: product.name }),
                tone: 'success',
              });
              window.setTimeout(() => setJustAdded(false), 400);
            }}
          />
        </StickyActionArea>
      }
    >
      <div className="vt-hero">
        <ProductImage src={product.imageUrl} alt={product.name} ratio="16/11" dimmed={soldOut} />
        <div
          className="vt-hero__actions"
          style={embedded ? undefined : { top: 'calc(var(--vt-space-3) + var(--vt-safe-top))' }}
        >
          <IconButton
            icon="chevronBack"
            label={t('common.back')}
            variant="overlay"
            onClick={onBack}
          />
          <IconButton
            icon={favourites.includes(product.id) ? 'heart' : 'heartOutline'}
            label={
              favourites.includes(product.id) ? t('a11y.removeFavourite') : t('a11y.saveFavourite')
            }
            variant="overlay"
            selected={favourites.includes(product.id)}
            onClick={() => toggleFavourite(product)}
          />
        </div>
      </div>

      <div className="vt-screen__inner">
        <section className="vt-stack-3">
          <div className="vt-row">
            {soldOut && <Badge tone="neutral">{t('product.soldOut')}</Badge>}
            {product.tags.includes('popular') && <Badge tone="brand">{t('tag.popular')}</Badge>}
            {product.tags.includes('new') && <Badge tone="light">{t('tag.new')}</Badge>}
          </div>
          <h1 className="vt-h1">{product.name}</h1>
          {product.description && (
            <p className="vt-body vt-text-secondary vt-prose">{product.description}</p>
          )}
        </section>

        {groups.length > 0 && <hr className="vt-divider" />}
        {groups.map(renderGroup)}
      </div>
    </ScreenShell>
  );
};
