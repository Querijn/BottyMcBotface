import fetch from "node-fetch";
import Discord = require("discord.js");
import levenshteinDistance from "./LevenshteinDistance";

interface ChampionData {
    id: number;
    name: string;
    key: string;
    skins: SkinData[];
}

interface SkinData {
    id: number;
    name: string;
    splashPath: string;
    uncenteredSplashPath: string;
    tilePath: string;
    loadscreenPath: string;
    chromas: ChromaData[];
}

interface ChromaData {
    id: number;
    name: string;
    chromaPath: string;
    colors: string[];
}

interface PerkData {
    id: number;
    name: string;
    shortDesc: string;
    iconPath: string;
    endOfGameStatDescs: string[];
}

interface ItemData {
    id: number;
    name: string;
    categories: string[];
    price: number;
    priceTotal: number;
    iconPath: number;
    from: string[];
    to: string[];
}

export default class GameData {

    private champData: ChampionData[];
    private perkData: PerkData[];
    private itemData: ItemData[];

    private bot: Discord.Client;

    public constructor(bot: Discord.Client) {
        this.bot = bot;

        bot.on("ready", async () => {
            setInterval(this.reloadData, 86400 * 1000);
        });
    }

    public async reloadData() {
        this.champData = await this.loadChampionData();
        this.perkData = await this.loadPerkData();
        this.itemData = await this.loadItemData();
        console.log("Game data reloaded!");
    }

    public async loadChampionData(): Promise<ChampionData[]> {
        const returnData: ChampionData[] = [];

        const championDataUrl = "https://raw.communitydragon.org/pbe/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json";
        const champions = await (await fetch(championDataUrl)).json();
        champions.forEach((c: any) => returnData.push({
            id: c.id,
            name: c.name,
            key: c.alias,
            skins: [],
        }));

        const skinDataUrl = "https://raw.communitydragon.org/pbe/plugins/rcp-be-lol-game-data/global/default/v1/skins.json";
        const skins = await (await fetch(skinDataUrl)).json() as SkinData[];

        (champions as ChampionData[]).map(c => c.id)
            .filter(id => id > 0)
            .map(i => i.toString())
            .forEach(id => {
                const skinKeys = Object.keys(skins).filter(k => k.startsWith(id)).filter(k => (k.length - id.length) === 3).map(k => +k);

                skinKeys.forEach(key => {
                    const data = skins[key];

                    const chromaData: ChromaData[] = [];
                    if (data.hasOwnProperty("chromas")) {
                        data.chromas.forEach(chroma => {
                            chromaData.push(chroma);
                        });
                    }

                    const skinData: SkinData = {
                        id: data.id,
                        name: data.name,
                        splashPath: data.splashPath,
                        uncenteredSplashPath: data.uncenteredSplashPath,
                        tilePath: data.tilePath,
                        loadscreenPath: data.loadscreenPath,
                        chromas: chromaData,
                    };

                    returnData.filter(r => r.id === +id)[0].skins.push(skinData);
                });
            });

        return returnData;
    }

    public async  loadPerkData(): Promise<PerkData[]> {
        const returnData: PerkData[] = [];

        const perkDataUrl = "https://raw.communitydragon.org/pbe/plugins/rcp-be-lol-game-data/global/default/v1/perks.json";
        const perks = await (await fetch(perkDataUrl)).json() as PerkData[];
        perks.forEach(perk => returnData.push(perk));
        return returnData;
    }

    public async  loadItemData(): Promise<ItemData[]> {
        const returnData: ItemData[] = [];

        const itemDataUrl = "https://raw.communitydragon.org/pbe/plugins/rcp-be-lol-game-data/global/default/v1/items.json";
        const items = await (await fetch(itemDataUrl)).json();
        items.forEach((c: ItemData) => returnData.push({
            id: c.id,
            name: c.name,
            categories: c.categories,
            price: c.price,
            priceTotal: c.priceTotal,
            iconPath: c.iconPath,
            from: [],
            to: [],
        }));

        items.forEach((i: any) => {
            const item = returnData.filter(r => r.id === +i.id)[0];

            i.from.forEach((f: number) => {
                const otherItem = returnData.filter(r => r.id === f)[0];
                item.from.push(otherItem.name);
            });

            i.to.forEach((f: number) => {
                const otherItem = returnData.filter(r => r.id === f)[0];
                item.to.push(otherItem.name);
            });
        });

        return returnData;
    }

    public async onLookup(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        if (message.cleanContent.length === 0) {
            let response = `I have info on the following categories; \`item\`,\`perk\`,\`champion\``;
            response += `type !${command} {search_type} {search_term} to use it`;
            message.channel.send(response);
            return;
        }

        if (!["item", "perk", "champion"].some(i => i === args[0])) {
            message.channel.send(`I'm sorry. I'm unable to parse the category ${args[0]} at this moment. If you want it added, contat a guru`);
            return;
        }

        if (args[0] === "item") {
            return this.findItem(args.slice(1).join(" "));
        }

        if (args[0] === "perk") {
            return this.findPerk(args.slice(1).join(" "));
        }

        if (args[0] === "champion") {
            return this.findChampion(args.slice(1).join(" "));
        }
    }

    public async findItem(search: string): Promise<string> {
        if (!search || search === undefined || search == null || search.length === 0) {
            return "There are currently ${itemData.length} items on the PBE server!";
        }

        const result = this.itemData.filter(c => Math.max(levenshteinDistance(search, c.id.toString()), levenshteinDistance(search, c.name), levenshteinDistance(search, c.categories.toString())) < 3);

        if (result.length === 0) {
            return "Unable to find any data for that search term.";
        }

        if (result.length > 1) {
            return "Too many results returned for that search, please try another";
        }

        return "```" + JSON.stringify(result[0], null, 4) + "```";
    }

    public async findPerk(search: string) {
        if (!search || search === undefined || search == null || search.length === 0) {
            return "There are currently ${perkData.length} perks on the PBE server!";
        }

        const result = this.perkData.filter(c => Math.max(levenshteinDistance(search, c.id.toString()), levenshteinDistance(search, c.name), levenshteinDistance(search, c.shortDesc)) < 3);

        if (result.length === 0) {
            return "Unable to find any data for that search term.";
        }

        if (result.length > 1) {
            return "Too many results returned for that search, please try another";
        }

        return "```" + JSON.stringify(result[0], null, 4) + "```";
    }

    public async findChampion(search: string) {
        if (!search || search === undefined || search == null || search.length === 0) {
            return "There are currently ${champData.length} champions on the PBE server!";
        }

        const result = this.champData.filter(c => Math.max(levenshteinDistance(search, c.id.toString()), levenshteinDistance(search, c.name), levenshteinDistance(search, c.key)) < 3);

        if (result.length === 0) {
            return "Unable to find any data for that search term.";
        }

        if (result.length > 1) {
            return "Too many results returned for that search, please try another";
        }

        return "```" + JSON.stringify(result[0], null, 4) + "```";
    }
}
