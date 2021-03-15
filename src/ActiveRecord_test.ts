import { ActiveRecord } from './ActiveRecord';
import { should } from './shoud';
import { strict } from 'assert';
import { toGet } from './toGet';
import { toQuery } from './toQuery';

describe('ActiveRecord', () => {
    it(
        'toGet 加载 hasMany 关系',
        should('按外键查询到数据', async (scene) => {
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
            const order = await scene.insert(Order, {});
            // 和 RoR 不同，关联关系如果不是 get/load/query 的时候指定了 fetch，都不会懒加载
            strict.equal(order.items, undefined);
            await scene.insert(OrderItem, { orderId: order.id });
            await scene.insert(OrderItem, { orderId: order.id });
            // scene.get 会使用 Order 这个类上定义的静态方法 get
            strict.equal(2, (await scene.get(Order, order.id)).items.length);
        }),
    );
    it(
        'toQuery 加载 hasMany 关系',
        should('按外键查询到数据', async (scene) => {
            class Order extends ActiveRecord {
                // 声明 query 的时候要 fetch Order 的 items
                public static readonly queryOrder = toQuery(Order).fetch(Order, 'items');
                public readonly id: string;
                public readonly items = this.hasMany(OrderItem);
            }
            class OrderItem extends ActiveRecord {
                public readonly id: string;
                public orderId: string;
            }
            const order = await scene.insert(Order, {});
            await scene.insert(OrderItem, { orderId: order.id });
            await scene.insert(OrderItem, { orderId: order.id });
            // scene.query 会使用 Order 这个类上定义的静态方法 query
            strict.equal(2, (await scene.query(Order, {}))[0].items.length);
        }),
    );
    it('toGet 加载 belongsTo 关系', should('按外键查询到数据', async (scene) => {
        class Order extends ActiveRecord {
            public readonly id: string;
            public readonly items = this.hasMany(OrderItem);
        }
        class OrderItem extends ActiveRecord {
            public static getOrderItem = toGet(OrderItem).fetch(OrderItem, 'order');
            public readonly id: string;
            public orderId: string;
            public readonly order = this.belongsTo(Order);
        }
        const order = await scene.insert(Order, {});
        const orderItem = await scene.insert(OrderItem, { orderId: order.id });
        const loaded = await OrderItem.getOrderItem(scene, orderItem.id);
        strict.equal(loaded.order.id, order.id);
    }))
    it('加载循环引用关系', should('复用对象', async (scene) => {
        class Order extends ActiveRecord {
            // 声明 get 的时候要 fetch Order 的 items
            public static readonly getOrder = toGet(Order).fetch(Order, 'items').fetch(async () => OrderItem, 'order');
            public readonly id: string;
            public readonly items = this.hasMany(OrderItem);
        }
        class OrderItem extends ActiveRecord {
            public readonly id: string;
            public orderId: string;
            public readonly order = this.belongsTo(Order);
        }
        const order = await scene.insert(Order, {});
        await scene.insert(OrderItem, { orderId: order.id });
        await scene.insert(OrderItem, { orderId: order.id });
        // scene.get 会使用 Order 这个类上定义的静态方法 get
        const loaded = await scene.get(Order, order.id);
        strict.equal(2, loaded.items.length);
        strict.equal(order.id, loaded.items[0].order.id);
    }))
});
