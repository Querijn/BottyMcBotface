import fs = require("fs");

export function fileBackedObject<T>(path: string): T {
    const contents = fs.readFileSync(path, "utf8");

    return new Proxy(JSON.parse(contents), {
        set(object, property, value, receiver) {
            Reflect.set(object, property, value, receiver);
            fs.writeFileSync(path, JSON.stringify(object));
            return true;
        }
    });
}
