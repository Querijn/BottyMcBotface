export default function joinArguments(args: string[], separators: string[], index: number = 0): string {
    let result = "";

    if (args.length != separators.length) {
        console.error(`Expected [ ${args.join(", ")} ] to be the same length as [ ${separators.join(", ")} ]!`);
    }

    let len = args.length < separators.length ? args.length : separators.length; // Just a precaution

    for (let i = index; i < len; i++) {
        result += args[i];
        result += separators[i];
    }

    return result;
}