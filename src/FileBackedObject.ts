import fs = require("fs");

export function fileBackedObject<T>(path: string): T {
    const contents = fs.readFileSync(path, "utf8");
    const obj = JSON.parse(contents);
    const proxy = {
        set(object: any, property: string, value: any, receiver: any) {
            Reflect.set(object, property, value, receiver);
            try {
                fs.writeFileSync(path, JSON.stringify(obj));
            }
            catch {

            }
            return true;
        },

        get(object: any, property: string, receiver: any): any {
            const child = Reflect.get(object, property, receiver);
            if (typeof child !== "object") return child;
            return new Proxy(child, proxy);
        }
    };

    return new Proxy(obj, proxy);
}
