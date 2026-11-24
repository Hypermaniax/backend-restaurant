import type { CategoryRepository } from './category.repository';
import { CategoriesService } from './categories.service';

const category = {
  id: 'category-1',
  outletId: 'outlet-1',
  name: 'Makanan',
  sortOrder: 1,
  isActive: true,
};

function buildService() {
  const categories = {
    listByOutlet: jest.fn(),
  };
  const service = new CategoriesService(
    categories as unknown as CategoryRepository,
  );

  return { service, categories };
}

describe('CategoriesService', () => {
  it('returns categories with pagination metadata', async () => {
    const { service, categories } = buildService();
    categories.listByOutlet.mockResolvedValue({
      items: [category],
      total: 41,
    });

    const result = await service.list('outlet-1', {
      page: 2,
      pageSize: 20,
      includeInactive: true,
    });

    expect(categories.listByOutlet).toHaveBeenCalledWith('outlet-1', true, {
      page: 2,
      pageSize: 20,
      includeInactive: true,
    });
    expect(result.items).toEqual([category]);
    expect(result.meta).toEqual({
      page: 2,
      pageSize: 20,
      total: 41,
      totalPages: 3,
    });
  });
});
