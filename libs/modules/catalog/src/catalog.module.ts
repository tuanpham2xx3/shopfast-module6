import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/src/auth.module";
import { RuntimeModule } from "../../runtime/src/runtime.module";
import { CatalogRuntime } from "./composition/catalog.runtime";
import {
  CatalogAdminController,
  CatalogController,
  InventoryController,
} from "./http/catalog.controllers";

@Module({
  imports: [AuthModule, RuntimeModule],
  controllers: [CatalogController, CatalogAdminController, InventoryController],
  providers: [CatalogRuntime],
})
export class CatalogModule {}
