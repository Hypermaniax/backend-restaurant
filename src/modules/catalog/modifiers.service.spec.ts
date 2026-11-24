import type { ModifierRepository } from './modifier.repository';
import { ModifiersService } from './modifiers.service';

const group = {
  id: 'group-1',
  outletId: 'outlet-1',
  name: 'Level Pedas',
  selectionType: 'SINGLE' as const,
  minSelect: 1,
  maxSelect: 1,
  isRequired: true,
  isActive: true,
  sortOrder: 0,
  options: [],
};

function buildService() {
  const modifiers = {
    listGroupsByOutlet: jest.fn(),
  };
  const service = new ModifiersService(
    modifiers as unknown as ModifierRepository,
  );

  return { service, modifiers };
}

describe('ModifiersService', () => {
  it('returns modifier groups with pagination metadata', async () => {
    const { service, modifiers } = buildService();
    modifiers.listGroupsByOutlet.mockResolvedValue({
      items: [group],
      total: 12,
    });

    const result = await service.listGroups('outlet-1', {
      page: 2,
      pageSize: 10,
      includeInactive: true,
    });

    expect(modifiers.listGroupsByOutlet).toHaveBeenCalledWith(
      'outlet-1',
      true,
      { page: 2, pageSize: 10, includeInactive: true },
    );
    expect(result.items).toHaveLength(1);
    expect(result.meta).toEqual({
      page: 2,
      pageSize: 10,
      total: 12,
      totalPages: 2,
    });
  });
});
