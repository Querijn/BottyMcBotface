import fs = require("fs");

export function fileBackedObject<T>(path: string): T {
    const contents = fs.readFileSync(path, "utf8");
    const obj = JSON.parse(contents);

    return generateProxy(obj, path);
}

export function isObject(item: any) {
    return (item && typeof item === 'object' && !Array.isArray(item));
}
  
export default function mergeDeep(target: any, source: any) {
    let output = Object.assign({}, target);
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            if (isObject(source[key])) {
                if (!(key in target))
                    Object.assign(output, { [key]: source[key] });
                else
                    output[key] = mergeDeep(target[key], source[key]);
            } else {
                Object.assign(output, { [key]: source[key] });
            }
        });
    }
    return output;
}

export function defaultBackedObject<T>(path: string, overwritePath: string): T {
    const defaults = fs.readFileSync(path, "utf-8");
    const overwrite = fs.readFileSync(overwritePath, "utf-8");
    const defaultsData = JSON.parse(defaults);
    const overwriteData = JSON.parse(overwrite);
    const obj = mergeDeep(defaultsData, overwriteData);

    return generateProxy(obj, path);
}

function generateProxy<T>(obj: T, path: string): T {
    const proxy = {
        set(object: any, property: string, value: any, receiver: any) {
            Reflect.set(object, property, value, receiver);
            try {
                fs.writeFileSync(path, JSON.stringify(obj));
            } catch (e) {
                fs.writeFile(path, JSON.stringify(obj), (err) => {
                    if (err) {
                        console.error(`${path} had trouble saving, but we weren't able to fix it.`);
                        fs.writeFileSync(path + "_backup", JSON.stringify(obj)); // last-ditch effort
                    } else {
                        console.warn(`${path} had trouble saving, but we fixed it.`);
                    }
                });
            }
            return true;
        },

        get(object: any, property: string, receiver: any): any {
            const child = Reflect.get(object, property, receiver);
            if (!child || typeof child !== "object") return child;
            return new Proxy(child, proxy);
        },
    };

    return new Proxy(obj, proxy);
}
