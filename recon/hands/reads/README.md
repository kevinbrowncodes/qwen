# Reads: what the recon asks the reference's page through Hands' `js` act (STORY_028)

Each file is one JavaScript expression, sent as it is with `recon/run.sh hands <date> js <file> --as <state>@<width>`; the answer is saved beside the look as `NN-<state>@<width>.result.txt`. Every read is a read of the owner's own page (`document`, `getComputedStyle`, `location`, `performance`) and nothing else: `recon/src/reads.test.ts` refuses a file that fetches, clicks, submits, dispatches an event, touches storage or assigns to the page.
