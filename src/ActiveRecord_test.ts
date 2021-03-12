import { ActiveRecord } from './ActiveRecord';
import { should } from './shoud';
import { strict } from 'assert';
import { toGet } from './toGet';

describe('ActiveRecord', () => {
    it(
        '加载 hasMany 关系',
        should('按外键查询到数据', async (scene) => {
            class Order extends ActiveRecord {
                // 声明 get 的时候要 fetch Order 的 items
                public static readonly get = toGet(Order).fetch(Order, 'items');
                public readonly id: string;
                public readonly items = this.hasMany(OrderItem);
            }
            class OrderItem extends ActiveRecord {
                public readonly id: string;
                public orderId: string;
            }
            const order = await scene.insert(Order, {});
            // 和 RoR 不同，关联关系如果不是 get/load/query 的时候指定了 fetch，都不会懒加载，而是直接抛异常
            strict.throws(() => order.items, '访问未 fetch 的 items 应该抛异常');
            await scene.insert(OrderItem, { orderId: order.id });
            await scene.insert(OrderItem, { orderId: order.id });
            // scene.get 会使用 Order 这个类上定义的静态方法 get
            strict.equal(2, (await scene.get(Order, order.id)).items.length);
        }),
    );
});
