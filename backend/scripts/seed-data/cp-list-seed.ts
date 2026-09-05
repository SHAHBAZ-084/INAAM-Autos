// Re-export canonical seed data from backend/src (bundled into packaged builds).
export {
  SEED_CATEGORIES,
  SEED_PRODUCTS,
  type SeedProduct,
  type SeedVariant,
} from '../../src/modules/products/cp-list-seed';
