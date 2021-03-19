import { Scene, Table } from "@rotcare/io";
import { ActiveRecord } from './ActiveRecord';

type MethodsOf<T> = {
    [P in keyof T]: T[P] extends (...a: any) => any ? P : never;
}[keyof T];

export function toRun<T extends ActiveRecord, M extends MethodsOf<T>>(table: Table<T>, methodName: M) {
    return async (scene: Scene, id: T['id'], ...args: Parameters<T[M]>): Promise<T[]> => {
        const entity = await scene.get(table, id);
        return await Reflect.get(entity, methodName).call(entity, scene, ...args);
    }
}