import { Scene, Table } from "@rotcare/io";
import { ActiveRecord } from "./ActiveRecord";

export function toCreate<T>(table: Table<T>) {
    const f = async (scene: Scene, props: Record<string, any>): Promise<T[]> => {
        return scene.useDatabase().insert(table, props);
    }
    return ActiveRecord.withFetch(f);
}