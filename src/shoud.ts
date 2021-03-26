import { InMemDatabase, newTrace, Scene, ServiceDispatcher } from '@rotcare/io';
import { HttpRpcClient } from '@rotcare/io-http-rpc';
import { ActiveRecord } from './ActiveRecord';

Scene.serviceDiscover = () => {
    return { host: 'localhost', port: 3000 };
};

export function should(behavior: string, func: (scene: Scene) => void) {
    return async function (this: any) {
        const scene = new Scene(newTrace('test'), {
            tenants: { db: 'default', localhost: 'default' },
            service: new ServiceDispatcher(new InMemDatabase(), new HttpRpcClient({ decode: ActiveRecord.decode })),
            onAtomChanged(atom) {
                atom.onAtomChanged(scene.span);
            },
        });
        return scene.execute(this, func);
    };
}
