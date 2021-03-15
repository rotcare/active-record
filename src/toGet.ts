import { Scene, Table } from "@rotcare/io";
import { ActiveRecord } from './ActiveRecord';

export function toGet<T>(table: Table<T>) {
    const f = async (scene: Scene, id?: any): Promise<T> => {
        const props = id ? { id } : {};
        const records = await scene.io.database.query(scene, table, props);
        if (records.length === 0) {
            const msg = `${table.tableName} find 0 match of  ${JSON.stringify(props)}`;
            throw new Error(msg);
        }
        if (records.length !== 1) {
            const msg = `${table.tableName} find more than 1 match of ${JSON.stringify(props)}`;
            throw new Error(msg);
        }
        return records[0];
    }
    return ActiveRecord.withFetch(f);
}
