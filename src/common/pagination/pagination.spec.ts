import {
  createPageResult,
  DEFAULT_PAGE_SIZE,
  resolvePagination,
} from './pagination.dto';

describe('pagination', () => {
  it('uses defaults and calculates the skip offset', () => {
    expect(resolvePagination()).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      skip: 0,
      take: DEFAULT_PAGE_SIZE,
      all: false,
    });
    expect(resolvePagination({ page: 3, pageSize: 10 })).toMatchObject({
      page: 3,
      pageSize: 10,
      skip: 20,
      take: 10,
    });
  });

  it('builds page metadata', () => {
    const result = createPageResult(['a', 'b'], 45, {
      page: 2,
      pageSize: 20,
      skip: 20,
      take: 20,
      all: false,
    });

    expect(result).toEqual({
      items: ['a', 'b'],
      meta: { page: 2, pageSize: 20, total: 45, totalPages: 3 },
    });
  });

  it('returns one page when all data is requested', () => {
    const result = createPageResult(['a', 'b', 'c'], 3, {
      page: 1,
      pageSize: 20,
      skip: 0,
      take: 20,
      all: true,
    });

    expect(result.meta).toEqual({
      page: 1,
      pageSize: 3,
      total: 3,
      totalPages: 1,
    });
  });
});
