import Discord = require("discord.js");

import { should } from "chai";
should();
import * as TypeMoq from "typemoq";

import GameData from "../src/GameData";
import { SharedSettings } from "../src/SharedSettings";

describe("GameData", () => {
    describe("#sortSearch(...)", () => {
        const mockClient = TypeMoq.Mock.ofType(Discord.Client);
        mockClient.callBase = true;
        mockClient.setup(c => c.on(TypeMoq.It.isAny(), TypeMoq.It.isAny()));

        const mockSettings = TypeMoq.Mock.ofType<SharedSettings>();

        const data = new GameData(mockClient.object, mockSettings.object);

        const sortSearchTestHelper: typeof data.sortSearch = (
            search, smaller, larger,
        ) => {
            const res = data.sortSearch(search, smaller, larger);
            res.should.be.lessThan(0);

            const res2 = data.sortSearch(search, larger, smaller);
            res2.should.be.greaterThan(0);

            return 0;
        };

        it("should return 0 for equal the same object", () => {
            const res = data.sortSearch(
                "fgsgfds",
                {
                    item: {id: 1, name: "1"},
                    score: 1,
                },
                {
                    item: {id: 1, name: "1"},
                    score: 1,
                },
            );

            res.should.equal(0);
        });

        it("should return an object with a score of 0", () => {
            const smaller = {item: {id: 1, name: "1"}, score: 0};
            const larger = {item: {id: 2, name: "2"}, score: 1};

            sortSearchTestHelper("fff", smaller, larger);
        });

        it("should check name for exact match after score", () => {
            const equal = {item: {id: 1, name: "AAA"}, score: 1};
            const notEqual = {item: {id: 2, name: "abcaaa"}, score: 1};

            sortSearchTestHelper("aaa", equal, notEqual);
        });

        it("should check if name starts with search after score", () => {
            const equal = {item: {id: 1, name: "ChoGath"}, score: 3};
            const notEqual = {item: {id: 2, name: "dfdfcho"}, score: 3};

            sortSearchTestHelper("cho", equal, notEqual);
        });

        it("should check if name contains the search string after score", () => {
            const equal = {item: {id: 1, name: "ChoGath"}, score: 3};
            const notEqual = {item: {id: 2, name: "ChGth"}, score: 3};

            sortSearchTestHelper("gath", equal, notEqual);
        });

        it("should check key for exact match after name", () => {
            const equal = {item: {id: 1, key: "cho", name: "ff"}, score: 3};
            const notEqual = {item: {id: 2, key: "gath", name: "fdfd"}, score: 3};

            sortSearchTestHelper("cho", equal, notEqual);
        });

        it("should check if key starts with the search after name", () => {
            const equal = {item: {id: 1, key: "chogath", name: "ff"}, score: 3};
            const notEqual = {item: {id: 2, key: "gathcho", name: "fdfd"}, score: 3};

            sortSearchTestHelper("cho", equal, notEqual);
        });

        it("should check if key contains the search after name", () => {
            const equal = {item: {id: 1, key: "chogath", name: "ff"}, score: 3};
            const notEqual = {item: {id: 2, key: "chgth", name: "fdfd"}, score: 3};

            sortSearchTestHelper("gath", equal, notEqual);
        });

        it("should check id for exact match after name and key", () => {
            const equal = {item: {id: 1, key: "abc", name: "ff"}, score: 3};
            const notEqual = {item: {id: 2, key: "def", name: "fdfd"}, score: 3};

            sortSearchTestHelper("1", equal, notEqual);
        });

        // todo: this seems... dumb AF. Why would you want a partial search by ID...?
        it("should check if id starts with search after name and key", () => {
            const equal = {item: {id: 12, name: "ff"}, score: 3};
            const notEqual = {item: {id: 22, name: "fdfd"}, score: 3};

            sortSearchTestHelper("1", equal, notEqual);
        });

        // todo: this seems... dumb AF. Why would you want a partial search by ID...?
        it("should check if id contains search after name and key", () => {
            const equal = {item: {id: 21, name: "ff"}, score: 3};
            const notEqual = {item: {id: 22, name: "fdfd"}, score: 3};

            sortSearchTestHelper("1", equal, notEqual);
        });

        it("should check score after checking all other possible matches", () => {
            const smaller = {item: {id: 123, name: "ff"}, score: 3};
            const larger = {item: {id: 321, name: "fdfd"}, score: 6};

            sortSearchTestHelper("hello", smaller, larger);
        });

        it("should alphabetize by name when scores equal", () => {
            const smaller = {item: {id: 1, name: "aaabc"}, score: 1};
            const larger = {item: {id: 1, name: "aaaDEF"}, score: 1};

            sortSearchTestHelper("hello", smaller, larger);
        });

        it("should alphabetize by key when scores and name equal", () => {
            const smaller = {item: {id: 1, key: "aaabc", name: "aa"}, score: 1};
            const larger = {item: {id: 1, key: "aaaDEF", name: "aa"}, score: 1};

            sortSearchTestHelper("hello", smaller, larger);
        });

        it("should order by id when scores and name equal and no key provided", () => {
            const smaller = {item: {id: 1, name: "aa"}, score: 1};
            const larger = {item: {id: 2, name: "aa"}, score: 1};

            sortSearchTestHelper("hello", smaller, larger);
        });

        it("should order by id when scores, name, and key equal", () => {
            const smaller = {item: {id: 1, key: "bb", name: "aa"}, score: 1};
            const larger = {item: {id: 2, key: "bb", name: "aa"}, score: 1};

            sortSearchTestHelper("hello", smaller, larger);
        });

        mockClient.object.destroy();
    });
});
