const MESSAGE_REGEX_1 = /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s(\d{1,2}\.\d{2}\.\d{2})\]\s/;
const MESSAGE_REGEX_2 = /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s(\d{1,2}:\d{2}(?:(?:\s|\u202F)?(?:am|pm|AM|PM))?)\s-\s/;
function testStr(s) {
    const m1 = s.match(MESSAGE_REGEX_1);
    const m2 = s.match(MESSAGE_REGEX_2);
    console.log(s, "=>", m1 ? m1.slice(1) : m2 ? m2.slice(1) : "No match");
}

testStr("11/08/25, 4:56 pm - Messages and calls are end-to-end encrypted.");
testStr("20/08/25, 8:10 am - Al Mughni: p mughniii");
testStr("20/08/25, 14:10 - Al Mughni: pm");
testStr("[15/01/26, 22.49.26] Healing💃🏼: ‎Messages");

