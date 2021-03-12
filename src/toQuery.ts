import { Scene, Table } from "@rotcare/io";
import { fetch } from './ActiveRecord';

type F<T> = ((scene: Scene, props: Partial<T>) => Promise<T[]>) & { fetch(table: Table<T>, ...props: (keyof T)[]): F<T> };

export function toQuery<T>(table: Table<T>): F<T> {
    const f = async (scene: Scene, props: Record<string, any>) => {
        return scene.io.database.query(scene, table, props);
    }
    f.fetch = fetch;
    return f as any;
}