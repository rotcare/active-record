import { InMemDatabase, newTrace, Scene } from "@rotcare/io";
import { HttpRpcClient } from "@rotcare/io-http-rpc";

export function should(behavior: string, func: (scene: Scene) => void) {
    return async function(this: any) {
        const scene = new Scene(newTrace('test'), {
            database: new InMemDatabase(),
            serviceProtocol: new HttpRpcClient(),
        });
        scene.onAtomChanged = (atom) => {
            atom.onAtomChanged(scene.span);
        }
        return scene.execute(this, func);
    };
}
