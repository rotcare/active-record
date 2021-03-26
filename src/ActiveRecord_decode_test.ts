import { ActiveRecord } from './ActiveRecord';
import { should } from './shoud';
import { strict } from 'assert';
import { toGet } from './toGet';
import * as http from 'http';
import fetch from 'node-fetch';
import { toCreate } from './toCreate';
import { HttpRpcServer } from '@rotcare/io-http-rpc';

describe('ActiveRecord / decode', () => {
    let httpServer: http.Server;
    before(() => {
        (global as any).fetch = fetch;
    });
    after(() => {
        (global as any).fetch = undefined;
    });
    afterEach(() => {
        httpServer.close();
    });
    it(
        '服务端获取的关联关系',
        should('在客户端可以读取到', async (scene) => {
            class Order extends ActiveRecord {
                public static readonly createOrder = toCreate(Order);
                // 声明 get 的时候要 fetch Order 的 items
                public static readonly getOrder = toGet(Order).fetch(Order, 'items');
                public readonly id: string;
                public readonly items = this.hasMany(OrderItem);
            }
            class OrderItem extends ActiveRecord {
                public static readonly createOrderItem = toCreate(OrderItem);
                public readonly id: string;
                public orderId: string;
            }
            const rpcServer = new HttpRpcServer({
                func: Order.getOrder,
            });
            httpServer = http.createServer(rpcServer.handle.bind(rpcServer, scene.conf)).listen(3000);

            const order = await scene.create(Order, {});
            await scene.create(OrderItem, { orderId: order.id });
            await scene.create(OrderItem, { orderId: order.id });

            const loadedOrder = await scene.execute(undefined, async () => {
                return await (scene.useService('localhost') as any).getOrder(order.id);
            });
            strict.equal(loadedOrder.id, order.id);
            strict.notEqual(loadedOrder.items, undefined);
            strict.equal(loadedOrder.items.length, 2);
        }),
    );
});
