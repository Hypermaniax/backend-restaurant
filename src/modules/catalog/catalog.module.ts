import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SecurityModule } from '../security/security.module';
import { TablesModule } from '../tables/tables.module';
import { CashierCatalogController } from './cashier-catalog.controller';
import { CashierMenuController } from './cashier-menu.controller';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { CategoryRepository } from './category.repository';
import { MenuImageService } from './menu-image.service';
import { MenuItemRepository } from './menu-item.repository';
import { MenuItemsController } from './menu-items.controller';
import { MenuItemsService } from './menu-items.service';
import { ModifierRepository } from './modifier.repository';
import { ModifiersController } from './modifiers.controller';
import { ModifiersService } from './modifiers.service';
import { PublicCatalogController } from './public-catalog.controller';
import { PublicCatalogRepository } from './public-catalog.repository';
import { PublicCatalogService } from './public-catalog.service';

@Module({
  imports: [SecurityModule, AuditModule, TablesModule],
  controllers: [
    CategoriesController,
    MenuItemsController,
    CashierCatalogController,
    CashierMenuController,
    ModifiersController,
    PublicCatalogController,
  ],
  providers: [
    CategoryRepository,
    MenuItemRepository,
    ModifierRepository,
    PublicCatalogRepository,
    CategoriesService,
    MenuItemsService,
    ModifiersService,
    PublicCatalogService,
    MenuImageService,
  ],
  exports: [MenuItemsService],
})
export class CatalogModule {}
