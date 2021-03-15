import { ActiveRecord } from './ActiveRecord';
import { should } from './shoud';
import { strict } from 'assert';
import { toGet } from './toGet';
import * as http from 'http';
import { Impl } from '@rotcare/io';
import fetch from 'node-fetch';

xdescribe('ActiveRecord / decode', () => {
    let httpServer: http.Server;
    let oldOutput: any;
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
                // 声明 get 的时候要 fetch Order 的 items
                public static readonly getOrder = toGet(Order).fetch(Order, 'items');
                public readonly id: string;
                public readonly items = this.hasMany(OrderItem);
            }
            class OrderItem extends ActiveRecord {
                public readonly id: string;
                public orderId: string;
            }
            scene.io.serviceProtocol = new Impl.HttpRpcClient({
                decode(data) {
                    return data;
                }
            });
            const rpcServer = new Impl.HttpRpcServer(
                {
                    ioConf: scene.io,
                },
                async () => {
                    return { Order }
                },
                'Order',
                'getOrder',
            );
            httpServer = http.createServer(rpcServer.handler).listen(3000);

            const order = await scene.insert(Order, {});
            // 和 RoR 不同，关联关系如果不是 get/load/query 的时候指定了 fetch，都不会懒加载，而是直接抛异常
            strict.throws(() => order.items, '访问未 fetch 的 items 应该抛异常');
            await scene.insert(OrderItem, { orderId: order.id });
            await scene.insert(OrderItem, { orderId: order.id });
            
            const loadedOrder = await scene.execute(undefined, async () => {
                return await (scene.useServices('localhost') as any).getOrder(order.id);
            });
            strict.equal(loadedOrder.id, order.id);
            strict.notEqual(loadedOrder.items, undefined);
            strict.equal(loadedOrder.items.length, 2);
        }),
    );
})