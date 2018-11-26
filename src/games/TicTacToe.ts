import { fileBackedObject } from "../FileBackedObject";
import { setTimeout } from "timers";

import Discord = require("discord.js");

interface TicTacToeScore {
    lowWins: number;
    highWins: number;
    draws: number;
}

enum TicTacToeBrain {
    RANDOM,
    MINIMAX, // should finish this sometime :shrug:
}

enum TicTacToeType {
    X = "X", O = "O",
}

namespace TicTacToeType {
    export function opposite(current: TicTacToeType): TicTacToeType | undefined {
        if (current === TicTacToeType.X) return TicTacToeType.O;
        if (current === TicTacToeType.O) return TicTacToeType.X;
        return undefined;
    }
}

interface TicTacToeGame {
    board: { [key: number]: TicTacToeType | undefined };
    turnPlayer: TicTacToeType;
    Xplayer: string;
    Oplayer: string;
    scoreKey: string;
    botBrain: TicTacToeBrain;
    channel: Discord.TextChannel;
}

export default class TicTacToe {

    private scores: { [key: string]: TicTacToeScore };
    private games: TicTacToeGame[] = [];

    constructor(client: Discord.Client, scorefile: string) {
        this.scores = fileBackedObject(scorefile);
        client.on("message", this.handleChat.bind(this));
        client.on("ready", () => {

            // delete all ttt channels on boot, because we lost all gamestate on restart
            const gameCategory = (client.channels.findAll("type", "category") as Discord.CategoryChannel[]).find(c => c.name === "games");
            (client.channels.findAll("type", "text") as Discord.TextChannel[])
                .filter(c => c.parent === gameCategory)
                .forEach(c => {
                    if (c.name.startsWith("ttt-")) {
                        c.delete();
                    }
                });
        });
    }

    public async onInvite(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        const opponent = message.mentions.users.first();
        if (!opponent) {
            message.reply("You need to specify an opponent to start a TTT game!");
            return;
        }

        if (opponent === message.author) {
            message.reply("You can't play against yourself!");
            return;
        }

        const senderName = message.author.username;
        const opponentName = opponent.username;

        const isAuthorHigherId = message.author.id.localeCompare(opponent.id) >= 0;
        const key = isAuthorHigherId ? message.author.id + "_" + opponent.id : opponent.id + "_" + message.author.id;
        const highP = isAuthorHigherId ? senderName : opponentName;
        const lowP = isAuthorHigherId ? opponentName : senderName;

        // limit users to starting one game themselfs
        const existingGame = message.guild.channels.filter(c => c.name.startsWith("ttt-"))
            .some(c => c.name
                .split("-")
                .splice(1, 3)
                .join("-")
                .split("-vs-")
                .filter(n => n === senderName).length > 0);

        if (existingGame) {
            message.reply("You can only start a game of TTT if youre not already playing in one!");
            return;
        }

        // only allow the players to send messages
        const permissions = [
            { id: message.author, type: "member", allow: ["SEND_MESSAGES"] },
            { id: opponent, type: "member", allow: ["SEND_MESSAGES"] },
            { id: message.guild.roles.find(r => r.name === "@everyone").id, type: "role", deny: ["SEND_MESSAGES"] },
        ];

        // setup a separate channel for the game, so we dont spam a real channel..
        const channelName = ("TTT-" + highP + "-vs-" + lowP).toLowerCase();
        const gameChannel = await message.guild.createChannel(channelName, "text", permissions) as Discord.TextChannel;
        let gameCategory = message.guild.channels.filter(c => c.type === "category").find(c => c.name === "games");
        if (!gameCategory) {
            gameCategory = await message.guild.createChannel("games", "category");
        }
        gameChannel.setParent(gameCategory);

        // setup game state
        const game = {} as TicTacToeGame;
        this.games.push(game);

        const random = Math.floor(Math.random() * 2);
        game.Xplayer = random ? message.author.id : opponent.id;
        game.Oplayer = random ? opponent.id : message.author.id;
        game.channel = gameChannel;
        game.turnPlayer = TicTacToeType.O;
        game.botBrain = TicTacToeBrain.RANDOM;
        game.scoreKey = key;
        game.board = {
            1: undefined, 2: undefined, 3: undefined,
            4: undefined, 5: undefined, 6: undefined,
            7: undefined, 8: undefined, 9: undefined,
        };

        // print the "welcome" message
        const status = this.scores[key] || (this.scores[key] = { highWins: 0, lowWins: 0, draws: 0 });
        const gamesPlayed = status.highWins + status.lowWins + status.draws;
        const startingPlayer = random ? senderName : opponentName;
        gameChannel.send(`Game ${gamesPlayed + 1} of ${message.author} vs ${opponent}\nThe gods have decided that ${startingPlayer} goes first`);

        this.incrementGameState(game, undefined);
    }

    private printGameBoard(game: TicTacToeGame) {
        const tl = game.board[1] || "1";
        const tm = game.board[2] || "2";
        const tr = game.board[3] || "3";

        const ml = game.board[4] || "4";
        const mm = game.board[5] || "5";
        const mr = game.board[6] || "6";

        const bl = game.board[7] || "7";
        const bm = game.board[8] || "8";
        const br = game.board[9] || "9";

        game.channel.send(`\`\`\`${tl} | ${tm} | ${tr}\n---------\n${ml} | ${mm} | ${mr}\n---------\n${bl} | ${bm} | ${br}\`\`\``);
    }

    private handleChat(message: Discord.Message) {
        const game = this.games.find(g => g.channel.id === message.channel.id);
        if (!game) return;

        if (message.cleanContent === "!ff") {
            if (message.author.id === game.Xplayer) {
                this.handleEndOfGame(game, game.Oplayer);
            }

            if (message.author.id === game.Oplayer) {
                this.handleEndOfGame(game, game.Xplayer);
            }
        }

        // ignore messages from the other player
        if (game.turnPlayer === TicTacToeType.X) {
            if (message.author.id === game.Oplayer) {
                return;
            }
        }
        if (game.turnPlayer === TicTacToeType.O) {
            if (message.author.id === game.Xplayer) {
                return;
            }
        }

        const regex = /^\d$/;
        if (regex.test(message.cleanContent)) {
            const move = +message.cleanContent;
            if (this.isValidMove(game.board, move)) {
                this.incrementGameState(game, move);
            }
        }
    }

    private isValidMove(board: { [key: number]: TicTacToeType | undefined }, move: number) {
        return board[move] === undefined && move > 0 && move < 10;
    }

    private incrementGameState(game: TicTacToeGame, move: number | undefined) {
        if (move) {
            game.board[move] = game.turnPlayer;
        }

        game.turnPlayer = TicTacToeType.opposite(game.turnPlayer)!;
        this.printGameBoard(game);

        const winner = this.getGameWinner(game);
        if (winner) {
            this.handleEndOfGame(game, winner);
            return;
        }

        this.doBottyMove(game);
    }

    private handleEndOfGame(game: TicTacToeGame, winner: string) {
        const high = game.Oplayer.localeCompare(game.Xplayer) >= 0;
        if (winner === game.Oplayer) {
            if (high) {
                this.scores[game.scoreKey].highWins++;
            } else {
                this.scores[game.scoreKey].lowWins++;
            }
        } else if (winner === game.Xplayer) {
            if (high) {
                this.scores[game.scoreKey].lowWins++;
            } else {
                this.scores[game.scoreKey].highWins++;
            }
        } else if (winner === "-1") {
            this.scores[game.scoreKey].draws++;
        }

        const oplayer = game.channel.members.find(m => m.id === game.Oplayer);
        const xplayer = game.channel.members.find(m => m.id === game.Xplayer);

        const highP = high ? oplayer.user.username : xplayer.user.username;
        const lowP = high ? xplayer.user.username : oplayer.user.username;
        const highScore = this.scores[game.scoreKey].highWins;
        const lowScore = this.scores[game.scoreKey].lowWins;
        const drawScore = this.scores[game.scoreKey].draws;

        game.channel.send("The game has ended!\nThis channel will be deleted in 15 seconds.\nScores are now: " + highP + " (" + highScore + ") - " + drawScore + " - " + "(" + lowScore + ") " + lowP);
        this.games = this.games.filter(g => g !== game);
        setTimeout(() => game.channel.delete(), 15 * 1000);
    }

    /**
     * returns "-1" for a draw
     * returns undefined for unfinished
     * otherwise the playerid of the winner
     */
    private getGameWinner(game: TicTacToeGame) {

        if (this.testPlayerWin(game, TicTacToeType.X)) {
            return game.Xplayer;
        }

        if (this.testPlayerWin(game, TicTacToeType.O)) {
            return game.Oplayer;
        }

        for (let i = 1; i < 10; i++) {
            if (game.board[i] === undefined) {
                return undefined;
            }
        }

        return "-1";
    }

    private testPlayerWin(game: TicTacToeGame, player: TicTacToeType) {
        return (game.board[1] === player && game.board[2] === player && game.board[3] === player) ||
            (game.board[4] === player && game.board[5] === player && game.board[6] === player) ||
            (game.board[7] === player && game.board[8] === player && game.board[9] === player) ||
            (game.board[1] === player && game.board[4] === player && game.board[7] === player) ||
            (game.board[2] === player && game.board[5] === player && game.board[8] === player) ||
            (game.board[3] === player && game.board[6] === player && game.board[9] === player) ||
            (game.board[1] === player && game.board[5] === player && game.board[9] === player) ||
            (game.board[3] === player && game.board[5] === player && game.board[7] === player);
    }

    private doBottyMove(game: TicTacToeGame) {
        const turnId = game.turnPlayer === TicTacToeType.X ? game.Xplayer : game.Oplayer;
        const isBottyTurn = game.channel.members.find(m => m.id === turnId).user.bot;

        if (isBottyTurn) {
            const bestMove = this.chooseMoveFromBrain(game.botBrain, game.board, game.turnPlayer);
            this.incrementGameState(game, bestMove);
        }
    }

    private chooseMoveFromBrain(brain: TicTacToeBrain, board: { [key: number]: TicTacToeType | undefined }, turn: TicTacToeType): number {
        switch (brain) {
            case TicTacToeBrain.RANDOM: {
                const validKeys = Object.entries(board).filter(e => e[1] === undefined).map(e => e[0]);
                return +validKeys[Math.floor(Math.random() * validKeys.length)];
            }
            default: {
                return this.chooseMoveFromBrain(TicTacToeBrain.RANDOM, board, turn);
            }
        }
    }
}
