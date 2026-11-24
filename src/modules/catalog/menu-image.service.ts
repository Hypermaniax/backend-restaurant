import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Map<string, string>([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

@Injectable()
export class MenuImageService {
  constructor(private readonly config: ConfigService) {}

  async store(file: Express.Multer.File | undefined): Promise<string> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File gambar wajib diunggah');
    }

    if (file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Ukuran gambar maksimal 2 MB');
    }

    const extension = ALLOWED_TYPES.get(file.mimetype);
    if (!extension) {
      throw new BadRequestException('Format gambar harus JPEG, PNG, atau WebP');
    }

    const root = this.config.get<string>('UPLOAD_DIR') ?? 'uploads';
    const directory = resolve(process.cwd(), root, 'menu');
    await mkdir(directory, { recursive: true });

    const filename = `${randomUUID()}${extension}`;
    await writeFile(resolve(directory, filename), file.buffer);

    return `/uploads/menu/${filename}`;
  }
}
