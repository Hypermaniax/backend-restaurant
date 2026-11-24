import { BadRequestException } from '@nestjs/common';
import type { SelectionType } from '../../generated/prisma/client';

export function normalizeMaxSelect(
  selectionType: SelectionType,
  minSelect: number,
  maxSelect: number | null | undefined,
): number | null {
  if (selectionType === 'SINGLE') {
    return 1;
  }

  if (maxSelect === undefined || maxSelect === null) {
    return null;
  }

  if (maxSelect < minSelect) {
    throw new BadRequestException(
      'maxSelect tidak boleh lebih kecil dari minSelect',
    );
  }

  return maxSelect;
}

export function validateSelection(
  selectionType: SelectionType,
  minSelect: number,
  maxSelect: number | null,
  isRequired: boolean,
): void {
  if (selectionType === 'SINGLE') {
    if (minSelect > 1) {
      throw new BadRequestException('minSelect untuk SINGLE maksimal 1');
    }
    if (isRequired && minSelect < 1) {
      throw new BadRequestException(
        'Grup wajib harus memiliki minSelect minimal 1',
      );
    }
    return;
  }

  if (isRequired && minSelect < 1) {
    throw new BadRequestException(
      'Grup wajib harus memiliki minSelect minimal 1',
    );
  }

  if (maxSelect !== null && maxSelect < minSelect) {
    throw new BadRequestException(
      'maxSelect tidak boleh lebih kecil dari minSelect',
    );
  }
}
