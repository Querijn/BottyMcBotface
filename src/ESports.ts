import fetch from "node-fetch";
import Discord = require("discord.js");
import { SharedSettings } from "./SharedSettings";
import * as CheerioAPI from "cheerio";
import * as momentjs from "moment";

interface ESportsAPIReturnData {
    resultsHtml: string;
    fixturesHtml: string;
    resultsMonths: string;
    fixturesMonths: string;
}

interface ESportsLeagueSchedule {
    league: string;
    time: string;
    teamA: string;
    teamB: string;
}

export default class ESportsAPI {
    private bot: Discord.Client;
    private settings: SharedSettings;

    private schedule: Map<string, Map<string, ESportsLeagueSchedule[]>> = new Map();

    constructor(bot: Discord.Client, settings: SharedSettings) {
        this.bot = bot;
        this.settings = settings;

        bot.on("ready", async () => {
            await this.loadData();
            this.postInfo();
        });
    }

    public onCheckNext(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        if (args.length !== 1) return;

        const data = args[0].trim().split(/[\/ -]/g);
        let date;

        const fullCheck = /\d{4}\/\d{1,2}\/\d{1,2}/;
        const curYearCheck = /\d{1,2}\/\d{1,2}/;

        // YYYY/MM/DD
        if (fullCheck.test(args[0])) {
            date = `${data[0]} ${parseInt(data[1], 10)} ${parseInt(data[2], 10)}`;
        }

        // MM/DD
        else if (curYearCheck.test(args[0])) {
            const currentYear = new Date().getFullYear();
            date = `${currentYear} ${parseInt(data[0], 10)} ${parseInt(data[1], 10)}`;
        }

        else if (args[0].toLowerCase() === "today") {
            const today = new Date();
            date = `${today.getFullYear()} ${today.getMonth() + 1} ${today.getDate()}`;
        }

        else if (args[0].toLowerCase() === "tomorrow") {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            date = `${tomorrow.getFullYear()} ${tomorrow.getMonth() + 1} ${tomorrow.getDate()}`;
        }

        // No match
        else {
            message.channel.send("The date you specified didn't match the format needed. (MM/DD or YYYY/MM/DD)");
            return;
        }

        const jsDate = new Date(date);
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        if (jsDate < now) {
            message.channel.send("The date has to be in the future.");
            return;
        }

        const schedule = this.schedule.get(date);
        this.sendPrintout(message.channel as Discord.TextChannel, schedule, date);
    }

    private postInfo() {
        const channel = this.settings.esports.printChannel;
        const esports = this.bot.guilds.get(this.settings.server)!.channels.find("name", channel);
        if (!esports) {
            console.error(`Esports: Unable to find channel #${channel}`);
            return;
        }

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0);
        tomorrow.setMinutes(0);

        let tellDate = "";

        // filter to only show new games (up-to one day in advance)
        const prints: Map<string, ESportsLeagueSchedule[]> = new Map();
        for (const [dateKey, entries] of this.schedule.entries()) {
            if (new Date(dateKey) > tomorrow) break;

            tellDate = dateKey;
            for (const [league, entryList] of entries) {
                for (const item of entryList) {

                    if (!item.time.includes("ago")) {
                        if (!prints.get(league)) {
                            prints.set(league, []);
                        }

                        prints.get(league)!.push(item);
                    }
                }
            }
        }

        this.sendPrintout(esports as Discord.TextChannel, prints, tellDate);
        setTimeout(this.postInfo.bind(this), this.settings.esports.printToChannelTimeout);
    }

    private sendPrintout(channel: Discord.TextChannel, data: Map<string, ESportsLeagueSchedule[]> | undefined, date: string) {

        date = (date || momentjs().format("YYYY M D"))
          .split(" ")
          .join("/");
        if (!data || data.size === 0) {
          channel.send(`No games played on ${date}`);
          return;
        }
        const embed = new Discord.RichEmbed();
        embed.title = `Games being played ${date.split(" ").join("/")}:`;
        if (!embed.fields) embed.fields = [];
        embed.color = 0x9b311a;

        for (const [league, games] of data) {

            let output = "";
            for (const game of games) {
                output += `${game.teamA} vs ${game.teamB}, ${momentjs(game.time, "YYYY MM DD HH:mm Z").fromNow()}\n`;
            }

            embed.fields.push({
                name: league,
                value: output + `[More about ${league} here](${this.getUrlByLeague(league)})\n`,
            });
        }

        embed.fields.push({
            name: "Stelar",
            value: "If you notice anything weird, reach out to @stelar7#1424"
        })

        channel.send({ embed });
    }

    // this can also check for older games by using resultsHtml instead of fixures
    private async loadData() {
        // pull data
        const data = await fetch("https://eu.lolesports.com/en/api/widget/schedule?timezone=Europe%2FOslo&leagues=26&leagues=3&leagues=2&leagues=6&leagues=7&leagues=5&leagues=4&leagues=9&leagues=10&leagues=1&leagues=43&slug=all");
        const html = (await data.json() as ESportsAPIReturnData).fixturesHtml;
        const schedule: Map<string, Map<string, ESportsLeagueSchedule[]>> = new Map();

        // for each date
        const asHtml = CheerioAPI.load(html);
        const parents = asHtml.root().find(".schedule__row-group");
        let currentYear = new Date().getFullYear();
        let currentMonth = new Date().getMonth() + 1;
        parents.each((_, dayGroup) => {
            // the current date
            const dayRoot = CheerioAPI.load(dayGroup).root();
            const date = dayRoot.find(".schedule__row--date").find("h2").text().split(" ");

            // get month number from text
            const gameMonth = new Date(`${date[1]} ${date[2]}`).getMonth() + 1;
            if (gameMonth < currentMonth) {
                currentMonth = gameMonth;
                currentYear++;
            }

            const realDate = `${currentYear} ${gameMonth} ${date[1]}`;
            schedule.set(realDate, new Map());

            // for each league
            const titles = dayRoot.find(".schedule__row--title");
            for (let index = 0; index < titles.length; index++) {
                const titleRow = titles.get(index);
                const tableRow = titleRow.next;

                // league title
                const titleRoot = CheerioAPI.load(titleRow).root();
                const title = titleRoot.find("h3 a").text();
                schedule.get(realDate)!.set(title, []);

                // league games
                const tableRoot = CheerioAPI.load(tableRow).root();
                const games = tableRoot.find(".schedule__table-row");

                // for each game
                for (let gameIndex = 0; gameIndex < games.length; gameIndex++) {
                    const gameRow = games.get(gameIndex);
                    const gameRoot = CheerioAPI.load(gameRow).root();

                    // game start time
                    const start = gameRoot.find(".schedule__table-cell--time .time").last().text().trim();
                    const timestamp = realDate + ` ${start}`;

                    // teams
                    const content = gameRoot.find(".schedule__table-cell--content .team a");
                    const teamA = content.first().text();
                    const teamB = content.last().text();

                    const gameData: ESportsLeagueSchedule = {
                        league: title,
                        time: timestamp,
                        teamA,
                        teamB,
                    };
                    schedule.get(realDate)!.get(title)!.push(gameData);
                }
            }
        });
        this.schedule = schedule;
        setTimeout(this.loadData.bind(this), this.settings.esports.updateTimeout);
    }

    private getUrlByLeague(leagueName: string) {
        return "https://eu.lolesports.com/en/league/" + leagueName.replace(/ /g, "-").toLowerCase();
    }
}
