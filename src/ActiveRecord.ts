import { Entity, Scene, Table } from '@rotcare/io';

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
        return new HasManyAssociation(this.class, dst) as any;
    }
    protected belongsTo<T>(dst: Table<T>): T {
        return undefined as any;
    }
    public get class() {
        return this.constructor as typeof ActiveRecord;
    }
}

// 给查询方法增加 fetch 关联关系的能力
// @internal
export function fetch(this: any, table: Table, ...props: PropertyKey[]): any {
    const fetchProps = new Map<Table, PropertyKey[]>();
    if (this.fetchProps) {
        for (const [k, v] of this.fetchProps.entries()) {
            fetchProps.set(k, v);
        }
    }
    for (const prop of props) {
        fetchProps.set(table, [...(fetchProps.get(table) || []), prop]);
    }
    const newF = async function(scene: Scene, ...args: any[]) {
        const result = await newF.rawFunction(scene, ...args);
        if (!result) {
            return result;
        }
        const records = Array.isArray(result) ? result : [result]
        for (const record of records) {
            const props = fetchProps.get(record.constructor as any) || [];
            for (const prop of props) {
                const association = getAssociation(record.constructor as any, prop);
                const value = await association.query(scene, record);
                Object.defineProperty(record, prop, {
                    // JSON.stringify 的时候就不会把关联的数据也序列化进去了
                    // 因为关联的数据中可能有循环引用
                    enumerable: false,
                    value: value
                })
            }
        }
        return result;
    }
    newF.fetch = (table: Table, prop: PropertyKey) => {
        return fetch.call(newF, table, prop);
    };
    newF.fetchProps = fetchProps;
    newF.rawFunction = this.rawFunction ? this.rawFunction : this;
    return newF as any;
}

const associationCache = new Map<Table, Map<PropertyKey, Association>>();

function inspectAssociations(activeRecord: ActiveRecord) {
    let associations = associationCache.get(activeRecord.class);
    if (associations) {
        return associations;
    }
    associations = new Map<PropertyKey, Association>();
    associationCache.set(activeRecord.class, associations);
    for (const [k, v] of Object.entries(activeRecord)) {
        if (v && v instanceof Association) {
            associations.set(k, v);
        }
    }
    return associations;
}

export function getAssociation(table: Table, prop: PropertyKey) {
    const associations = associationCache.get(table);
    if (associations) {
        const association = associations.get(prop);
        if (association) {
            return association;
        }
    }
    throw new Error(`association ${table.tableName}.${prop.toString()} not defined`);
}

abstract class Association {
    public readonly type: 'hasMany' | 'belongsTo';
    public readonly dstTable: Table;
    public abstract query(scene: Scene, srcRecord: ActiveRecord): Promise<any>;
}
class HasManyAssociation extends Association {
    public readonly type = 'hasMany';
    public readonly fk: string;
    constructor(public readonly srcTable: Table, public readonly dstTable: Table) {
        super();
        this.fk = `${srcTable.tableName[0].toLowerCase()}${srcTable.tableName.substr(1)}Id`;
    }
    public async query(scene: Scene, srcRecord: ActiveRecord) {
        return scene.io.database.query(scene, this.dstTable, { [this.fk]: srcRecord.id });
    }
}
