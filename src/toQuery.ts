import { Scene, Table } from "@rotcare/io";
import { ActiveRecord } from './ActiveRecord';

export function toQuery<T>(table: Table<T>) {
    const f = async (scene: Scene, props: Record<string, any>) => {
        return scene.io.database.query(scene, table, props);
    }
    return ActiveRecord.withFetch(f);
}