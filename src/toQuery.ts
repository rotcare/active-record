import { Scene, Table } from "@rotcare/io";
import { ActiveRecord } from './ActiveRecord';

export function toQuery<T>(table: Table<T>) {
    const f = async (scene: Scene, props: Record<string, any>): Promise<T[]> => {
        return scene.useDatabase().query(table, props);
    }
    return ActiveRecord.withFetch(f);
}