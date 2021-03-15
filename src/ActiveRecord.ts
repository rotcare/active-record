import { Entity, isTable, Scene, Table } from '@rotcare/io';
import { Impl } from '@rotcare/io';
import { BelongsToAssociation, getAssociation, HasManyAssociation, inspectAssociations } from './Association';

type TableProvider<T = any> = () => Promise<Table<T>>;
interface FetchProp {
    table: Table | TableProvider,
    prop: PropertyKey
}
type WithFetch<F> = F & {
    // 为了避免循环引用，以及支持懒加载，允许用 promise 来提供 Table 定义
    fetch<T>(table: TableProvider<T>, ...props: (keyof T)[]): WithFetch<F>,
    fetch<T>(table: Table<T>, ...props: (keyof T)[]): WithFetch<F>
};

export class ActiveRecord extends Entity {
    public readonly id: unknown;
    // @internal
    public onLoad(options: { update: () => Promise<void>; delete: () => Promise<void> }) {
        super.onLoad(options);
        for (const k of inspectAssociations(this).keys()) {
            Object.defineProperty(this, k, {
                enumerable: false,
                configurable: true,
                get() {
                    throw new Error('association not fetched, add .fetch() after toGet/toLoad/toQuery');
                },
            });
        }
    }
    protected hasMany<T>(dst: Table<T>): T[] {
        return new HasManyAssociation(this.table, dst) as any;
    }
    protected belongsTo<T>(dst: Table<T>): T {
        return new BelongsToAssociation(this.table, dst) as any;
    }
    public static withFetch<F>(f: F): WithFetch<F> {
        (f as any).fetch = fetch;
        return f as any;
    }
}

// 给查询方法增加 fetch 关联关系的能力
function fetch(this: any, table: Table | TableProvider, ...props: PropertyKey[]): any {
    const fetchProps: FetchProp[] = [...(this.fetchProps || [])];
    for (const prop of props) {
        fetchProps.push({ table, prop });
    }
    let fetchPropsByTable: Map<Table, PropertyKey[]>;
    // 本地方法调用的时候是这个实现
    const newF = async function (scene: Scene, ...args: any[]) {
        const result = await newF.rawFunction(scene, ...args);
        if (!result) {
            return result;
        }
        if (!fetchPropsByTable) {
            fetchPropsByTable = new Map();
            for (const { table, prop } of fetchProps) {
                const _table = isTable(table) ? table : await table()
                let props = fetchPropsByTable.get(_table);
                if (!props) {
                    fetchPropsByTable.set(_table, props = []);
                }
                props.push(prop);
            }
        }
        const records = Array.isArray(result) ? result : [result]
        for (const record of records) {
            await fetchAssociations(scene, fetchPropsByTable, record);
        }
        return result;
    }
    // 远程方法调用的时候是这个实现
    newF.batchExecute = (jobs: Impl.HttpRpc.Job[]) => {
        const batches: Impl.HttpRpc.JobBatch[] = [];
        for (const job of jobs) {
            const theJob = job;
            batches.push({
                jobs: [theJob],
                async execute(scene) {
                    theJob.result = await newF.rawFunction(scene, ...theJob.args);
                }
            })
        }
        return batches;
    }
    newF.fetch = (table: Table, prop: PropertyKey) => {
        return fetch.call(newF, table, prop);
    };
    newF.fetchProps = fetchProps;
    newF.rawFunction = this.rawFunction ? this.rawFunction : this;
    return newF as any;
}

async function fetchAssociations(scene: Scene, fetchProps: Map<Table, PropertyKey[]>, record: ActiveRecord) {
    const props = fetchProps.get(record.table) || [];
    for (const prop of props) {
        const association = getAssociation(record.table, prop);
        const value = await association.fetch(scene, record);
        Object.defineProperty(record, prop, {
            // JSON.stringify 的时候就不会把关联的数据也序列化进去了
            // 因为关联的数据中可能有循环引用
            enumerable: false,
            configurable: true,
            value: value
        })
    }
}