import fs = require("fs-extra");
import path = require('path');

export function fileBackedObject<T>(location: string, backupLocation: string | null = null): T {
    const contents = fs.readFileSync(location, "utf8");
    const obj = JSON.parse(contents);

    if (backupLocation)
        fs.ensureDirSync(path.dirname(backupLocation));
        
    return generateProxy(obj, location, backupLocation);
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

export function overrideFileBackedObject<T>(location: string, overwriteLocation: string): T {
    const defaults = fs.readFileSync(location, "utf-8");
    const overwrite = fs.readFileSync(overwriteLocation, "utf-8");
    const defaultsData = JSON.parse(defaults);
    const overwriteData = JSON.parse(overwrite);
    const obj = mergeDeep(defaultsData, overwriteData);

    return generateProxy(obj, location);
}

function generateProxy<T>(obj: T, location: string, backupLocation: string | null = null): T {
    const proxy = {
        set(object: any, property: string, value: any, receiver: any) {
            Reflect.set(object, property, value, receiver);
            const data = JSON.stringify(obj);
            fs.writeFileSync(location, data);
            if (backupLocation)
                fs.writeFileSync(backupLocation, data);
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
