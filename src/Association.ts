import { Entity, Scene, Table } from "@rotcare/io";

interface ActiveRecord extends Entity {
    id: unknown;
}

const associationCache = new Map<Table, Map<PropertyKey, Association>>();

export function clearAssociationCache() {
    associationCache.clear();
}

export function inspectAssociations(activeRecord: ActiveRecord) {
    let associations = associationCache.get(activeRecord.table);
    if (associations) {
        return associations;
    }
    associations = new Map<PropertyKey, Association>();
    associationCache.set(activeRecord.table, associations);
    for (const [k, v] of Object.entries(activeRecord)) {
        if (v && v instanceof Association) {
            v.propertyKey = k;
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
    // 在 inspectAssociations 的时候注入
    public propertyKey: PropertyKey; 
    public abstract fetch(scene: Scene, srcRecord: ActiveRecord): Promise<any>;
}

export class HasManyAssociation extends Association {
    public readonly type = 'hasMany';
    public readonly fk: string;
    constructor(public readonly srcTable: Table, public readonly dstTable: Table) {
        super();
        this.fk = `${srcTable.tableName[0].toLowerCase()}${srcTable.tableName.substr(1)}Id`;
    }
    public fetch(scene: Scene, srcRecord: ActiveRecord) {
        return scene.io.database.query(scene, this.dstTable, { [this.fk]: srcRecord.id });
    }
}

export class BelongsToAssociation extends Association {
    public readonly type = 'belongsTo';
    constructor(public readonly srcTable: Table, public readonly dstTable: Table) {
        super();
    }
    public async fetch(scene: Scene, srcRecord: ActiveRecord) {
        const records = await scene.io.database.query(scene, this.dstTable, { id: Reflect.get(srcRecord, `${this.propertyKey.toString()}Id`) });
        if (records.length !== 1) {
            throw new Error('belongsTo find multiple parent');
        }
        return records[0];
    }
}