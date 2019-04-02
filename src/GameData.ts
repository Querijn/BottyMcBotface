import fetch from "node-fetch";
import Discord = require("discord.js");
import { levenshteinDistance, levenshteinDistanceArray } from "./LevenshteinDistance";
import { SharedSettings } from "./SharedSettings";

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
interface SearchType {
    item: {
        id: number;
        name: string;
        key?: string,
    };
    score: number;
}

export default class GameData {

    private champData: ChampionData[];
    private perkData: PerkData[];
    private itemData: ItemData[];

    private bot: Discord.Client;
    private sharedSettings: SharedSettings;

    public constructor(bot: Discord.Client, settings: SharedSettings) {
        this.bot = bot;
        this.sharedSettings = settings;

        bot.on("ready", async () => {
            this.reloadData();
            setInterval(this.reloadData, this.sharedSettings.lookup.refreshTimeout);
        });
    }

    public async reloadData() {
        this.champData = await this.loadChampionData();
        this.perkData = await this.loadPerkData();
        this.itemData = await this.loadItemData();
        console.log("Game data loaded!");
    }

    public async loadChampionData(): Promise<ChampionData[]> {
        const champions = await fetch(this.sharedSettings.lookup.championUrl).then(x => x.json());

        const returnData: ChampionData[] = champions
            .filter((c: any) => c.id > 0)
            .map((c: any) => ({
                id: c.id,
                name: c.name,
                key: c.alias,
                skins: [],
            }));

        const skins = await this.loadSkinData();
        for (const champion of returnData) {
            champion.skins = skins.filter(x => Math.floor(x.id / 1000) === champion.id);
        }

        return returnData;
    }

    public async loadSkinData(): Promise<SkinData[]> {
        return Object.values(await fetch(this.sharedSettings.lookup.skinUrl).then(x => x.json())) as SkinData[];
    }

    public async loadPerkData(): Promise<PerkData[]> {
        return await fetch(this.sharedSettings.lookup.perkUrl).then(x => x.json());
    }

    public async loadItemData(): Promise<ItemData[]> {
        const items = await fetch(this.sharedSettings.lookup.itemUrl).then(x => x.json()) as ItemData[];
        for (const item of items) {
            const other = items.find(x => x.id === item.id)!;

            other.from = item.from.map(x => items.find(y => y.id === +x)!).filter(x => x).map(x => x.name);
            other.to = item.to.map(x => items.find(y => y.id === +x)!).filter(x => x).map(x => x.name);
        }

        return items;
    }

    public onLookup(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        const supportedTypes = ["item", "perk", "rune", "champion"];

        if (args.length === 0) {
            const response = `Usage: !${command} [type] [term]. Supported types are ` + supportedTypes.map(x => "`" + x + "`").join(", ");
            message.channel.send(response);
            return;
        }

        if (!supportedTypes.includes(args[0])) {
            message.channel.send(`I'm sorry. I'm unable to parse the category \`${args[0]}\` at this moment. If you think it should be added, please contact a guru.`);
            return;
        }

        const searchTerm = args.slice(1).join(" ").toLowerCase();
        let result: string | any[] = [];
        switch (args[0]) {
            case "item": {
                result = this.findItem(searchTerm);
                break;
            }
            case "perk": // fall through
            case "rune": {
                result = this.findPerk(searchTerm);
                break;
            }
            case "champion": {
                result = this.findChampion(searchTerm);
                break;
            }
        }

        if (typeof result === "string") {
            message.channel.send(result);
            return;
        }

        result.forEach(x => message.channel.send("```" + JSON.stringify(x, (k, v) => { if (v !== null) return v; }, 4) + "```"));
    }

    public sortSearch(search: string, a: SearchType, b: SearchType) {
        if (a.score === 0) return -1;
        if (b.score === 0) return 1;

        const nameA = a.item.name.toLowerCase();
        const nameB = b.item.name.toLowerCase();

        if (nameA === search) return -1;
        if (nameB === search) return 1;

        if (nameA.startsWith(search) && !nameB.startsWith(search)) return -1;
        if (nameB.startsWith(search) && !nameA.startsWith(search)) return 1;

        if (nameA.includes(search) && !nameB.includes(search)) return -1;
        if (nameB.includes(search) && !nameA.includes(search)) return 1;

        if (a.item.key && b.item.key) {
            const keyA = a.item.key!;
            const keyB = b.item.key!;

            if (keyA === search) return -1;
            if (keyB === search) return 1;

            if (keyA.startsWith(search) && !keyB.startsWith(search)) return -1;
            if (keyB.startsWith(search) && !keyA.startsWith(search)) return 1;

            if (keyA.includes(search) && !keyB.includes(search)) return -1;
            if (keyB.includes(search) && !keyA.includes(search)) return 1;
        }

        const idA = a.item.id.toString();
        const idB = a.item.id.toString();

        if (idA === search) return -1;
        if (idB === search) return 1;

        if (idA.startsWith(search) && !idB.startsWith(search)) return -1;
        if (idB.startsWith(search) && !idA.startsWith(search)) return 1;

        if (idA.includes(search) && !idB.includes(search)) return -1;
        if (idB.includes(search) && !idA.includes(search)) return 1;

        if (a.score < b.score) return -1;
        if (b.score < a.score) return 1;

        return 0;
    }

    public findItem(search: string): string | any {
        if (!search) {
            return `There are currently ${this.itemData.length} items in my lookup data!`;
        }

        let searchResult: SearchType[];
        if (search.match(/^\d+$/)) {
            searchResult = this.itemData.map(i => ({ item: i, score: levenshteinDistance(search, i.id.toString()) }));
        } else {
            searchResult = this.itemData.map(i => ({ item: i, score: levenshteinDistance(search, i.name.toLowerCase()) }));
        }

        searchResult = searchResult.sort((a, b) => this.sortSearch(search, a, b)).slice(0, this.sharedSettings.lookup.maxGuessCount);

        // no exact match, so give alternatives
        if (searchResult[0].score !== 0) {
            if (searchResult.length > 0) {
                let response = "Too many results returned for that search, did you mean one of the options below?\n```";
                response += searchResult.map(x => `${x.item.name} (Alternate terms: ${x.item.id})`).join("\n");
                response += "```";
                return response;
            } else {
                return "Unable to find any data for that search term.";
            }
        }

        return searchResult.map(x => x.item as ItemData)
            .map(x => ({
                id: x.id,
                name: x.name,
                combineCost: x.price,
                cost: x.priceTotal,
                from: x.from.length > 0 ? x.from : null,
                to: x.to.length > 0 ? x.to : null,
            })).slice(0, 1);
    }

    public findPerk(search: string): string | any[] {
        if (!search) {
            return `There are currently ${this.perkData.length} perks in my lookup data!`;
        }

        let searchResult: SearchType[];
        if (search.match(/^\d+$/)) {
            searchResult = this.perkData.map(i => ({ item: i, score: levenshteinDistance(search, i.id.toString()) }));
        } else {
            searchResult = this.perkData.map(i => ({ item: i, score: levenshteinDistance(search, i.name.toLowerCase()) }));
        }

        searchResult = searchResult.sort((a, b) => this.sortSearch(search, a, b)).slice(0, this.sharedSettings.lookup.maxGuessCount);

        // no exact match, so give alternatives
        if (searchResult[0].score !== 0) {
            if (searchResult.length > 0) {
                let response = "Too many results returned for that search, did you mean one of the options below?\n```";
                response += searchResult.map(x => `${x.item.name} (Alternate terms: ${x.item.id})`).join("\n");
                response += "```";
                return response;
            } else {
                return "Unable to find any data for that search term.";
            }
        }

        return searchResult.map(x => x.item as PerkData)
            .map(x => ({
                id: x.id,
                name: x.name,
                endOfGameStatDescs: x.endOfGameStatDescs,
            })).slice(0, 1);
    }

    public findChampion(search: string): string | any[] {
        if (!search) {
            return `There are currently ${this.champData.length} champions in my lookup data!`;
        }

        let searchResult: SearchType[];
        if (search.match(/^\d+$/)) {
            searchResult = this.champData.map(i => ({ item: i, score: levenshteinDistance(search, i.id.toString()) }));
        } else {
            searchResult = this.champData.map(i => ({
                item: i,
                score: Math.min(
                    levenshteinDistance(search, i.name.toLowerCase()),
                    levenshteinDistance(search, i.key.toLowerCase()),
                ),
            }));
        }

        searchResult = searchResult.sort((a, b) => this.sortSearch(search, a, b)).slice(0, this.sharedSettings.lookup.maxGuessCount);

        // no exact match, so give alternatives
        if (searchResult[0].score !== 0) {
            if (searchResult.length > 0) {
                let response = "Too many results returned for that search, did you mean one of the options below?\n```";
                response += searchResult.map(x => `${x.item.name} (Alternate terms: ${x.item.id} / ${x.item.key})`).join("\n");
                response += "```";
                return response;
            } else {
                return "Unable to find any data for that search term.";
            }
        }

        return searchResult.map(x => x.item as ChampionData)
            .map(x => ({
                ...x,
                skins: x.skins.map(s => s.name).filter(s => s !== x.name),
            })).slice(0, 1);
    }
}
