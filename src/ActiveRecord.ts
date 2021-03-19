import { Entity, isTable, Scene, Table } from '@rotcare/io';
import { HttpRpc } from '@rotcare/io-http-rpc';
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
    public static create(props: Record<string, any>) {
        const entity = super.create(props) as ActiveRecord;
        for (const k of inspectAssociations(entity).keys()) {
            Object.defineProperty(entity, k, {
                enumerable: false,
                configurable: true,
                value: undefined,
            });
        }
        return entity;
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
    public static decode(encoded: any) {
        let identityMap = encoded?.__identityMap__;
        if (identityMap) {
            return decodeObjectGraph(identityMap, encoded.value);
        }
        return encoded;
    }
}

function decodeObjectGraph(identityMap: Record<string, object>, value: any) {
    if (Array.isArray(value)) {
        return value.map((elem: string) => restoreAssociations(identityMap, elem));
    }
    return restoreAssociations(identityMap, value);
}

function restoreAssociations(identityMap: Record<string, object>, qualified: string) {
    const record = identityMap[qualified];
    if (!record) {
        throw new Error(`${qualified} not found in identity map ${JSON.stringify(Object.keys(identityMap))}`);
    }
    const associations = Reflect.get(record, '__associations__');
    if (!associations) {
        return record;
    }
    Reflect.deleteProperty(record, '__associations__');
    for (const [prop, value] of Object.entries(associations)) {
        Reflect.set(record, prop, decodeObjectGraph(identityMap, value));
    }    
    return record;
}

async function encodeObjectGraph(scene: Scene, result: any, fetchResultAssociations: (scene: Scene, result: any,
    onPropsFetched?: (record: ActiveRecord, props: PropertyKey[]) => void) => Promise<Record<string, ActiveRecord>>) {
    if (!result) {
        return result;
    }
    const identityMap = await fetchResultAssociations(scene, result, (record, props) => {
        const associations: Record<string, any> = {};
        Reflect.set(record, '__associations__', associations);
        for (const prop of props) {
            associations[prop.toString()] = encodeValue(Reflect.get(record, prop));
        }
    });
    return {
        '__identityMap__': identityMap,
        'value': encodeValue(result)
    }
}

function encodeValue(value: any) {
    if (!value) {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(elem => getQualifiedId(elem));
    }
    return getQualifiedId(value);
}

// 给查询方法增加 fetch 关联关系的能力
function fetch(this: any, table: Table | TableProvider, ...props: PropertyKey[]): any {
    // 链式调用会累积需要 fetch 的 props
    const fetchProps: FetchProp[] = [...(this.fetchProps || [])];
    for (const prop of props) {
        fetchProps.push({ table, prop });
    }
    let fetchPropsByTable: Map<Table, PropertyKey[]>;
    async function fetchResultAssociations(scene: Scene, result: any,
        onPropsFetched?: (record: ActiveRecord, props: PropertyKey[]) => void) {
        if (!result) {
            return {};
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
        return await fetchRecordsAssociations(scene, fetchPropsByTable, records, onPropsFetched);
    }
    // 本地方法调用的时候是这个实现
    const newF = async function (scene: Scene, ...args: any[]) {
        const result = await newF.rawFunction(scene, ...args);
        await fetchResultAssociations(scene, result);
        return result;
    }
    // 远程方法调用的时候是这个实现
    newF.batchExecute = (jobs: HttpRpc.Job[]) => {
        const batches: HttpRpc.JobBatch[] = [];
        for (const job of jobs) {
            const theJob = job;
            batches.push({
                jobs: [theJob],
                async execute(scene) {
                    const result = await newF.rawFunction(scene, ...theJob.args);
                    theJob.result = await encodeObjectGraph(scene, result, fetchResultAssociations);
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

async function fetchRecordsAssociations(scene: Scene, fetchProps: Map<Table, PropertyKey[]>, initialRecords: ActiveRecord[],
    onPropsFetched?: (record: ActiveRecord, props: PropertyKey[]) => void) {
    const identityMap: Record<string, ActiveRecord> = {};
    for (const record of initialRecords) {
        if (!(record instanceof ActiveRecord)) {
            throw new Error(`${record} is not ActiveRecord`);
        }
        identityMap[`${record.table.tableName}:${record.id}`] = record;
    }
    let remainingRecords = initialRecords;
    while (remainingRecords.length) {
        const toLoad = [...remainingRecords];
        remainingRecords = [];
        for (const record of toLoad) {
            const props = fetchProps.get(record.table);
            if (!props) {
                continue;
            }
            for (const prop of props) {
                const association = getAssociation(record.table, prop);
                let value = await association.fetch(scene, record);
                if (Array.isArray(value)) {
                    value = deduplicate({ identityMap, loadedRecords: value, remainingRecords });
                } else {
                    value = deduplicate({ identityMap, loadedRecords: [value], remainingRecords })[0];
                }
                Object.defineProperty(record, prop, {
                    // JSON.stringify 的时候就不会把关联的数据也序列化进去了
                    // 因为关联的数据中可能有循环引用
                    enumerable: false,
                    configurable: true,
                    value: value
                })
            }
            if (onPropsFetched) {
                onPropsFetched(record, props);
            }
        }
    }
    return identityMap;
}

function deduplicate(options: {
    identityMap: Record<string, ActiveRecord>,
    loadedRecords: ActiveRecord[],
    remainingRecords: ActiveRecord[],
}) {
    const { identityMap, loadedRecords, remainingRecords } = options;
    for (const [i, record] of loadedRecords.entries()) {
        const qualifiedId = getQualifiedId(record);
        const existing = identityMap[qualifiedId];
        if (existing) {
            loadedRecords[i] = existing;
        } else {
            remainingRecords.push(record);
            identityMap[qualifiedId] = record;
        }
    }
    return loadedRecords;
}

function getQualifiedId(record: ActiveRecord) {
    return `${record.table.tableName}:${record.id}`;
}