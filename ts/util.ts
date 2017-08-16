import fs = require("fs");

export const fileBackedObject = (path: string) => {
	const contents: string = fs.readFileSync(path, "utf8");

	return new Proxy(JSON.parse(contents), {
		set(object, property, value, receiver) {
			Reflect.set(object, property, value, receiver);
			fs.writeFileSync(path, JSON.stringify(object));
			return true;
		}
	});
}