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
                fs.writeFile(path, JSON.stringify(obj), (err) => {
                    if (err) {
                        console.error(`${path} had trouble saving, but we weren't able to fix it.`);
                        fs.writeFileSync(path + "_backup", JSON.stringify(obj)); // last-ditch effort
                    } 
                    else console.warn(`${path} had trouble saving, but we fixed it.`);
                });
            }
            return true;
        },

        get(object: any, property: string, receiver: any): any {
            const child = Reflect.get(object, property, receiver);
            if (!child || typeof child !== "object") return child;
            return new Proxy(child, proxy);
        }
    };

    return new Proxy(obj, proxy);
}
