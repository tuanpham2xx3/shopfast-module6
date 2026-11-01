import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/src/auth.module";
import { RuntimeModule } from "../../runtime/src/runtime.module";
import { OrderRuntime } from "./composition/orders.runtime";
import {
  AdminOrderController,
  CartController,
  OrdersController,
  StaffOrdersController,
} from "./http/orders.controllers";

@Module({
  imports: [AuthModule, RuntimeModule],
  controllers: [
    CartController,
    OrdersController,
    StaffOrdersController,
    AdminOrderController,
  ],
  providers: [OrderRuntime],
})
export class OrderModule {}
