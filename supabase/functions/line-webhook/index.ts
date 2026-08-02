/**
 * line-webhook — one-time groupId discovery helper.
 *
 * Setup only: set this function's URL as the Messaging API webhook, invite
 * the bot to the club group, then read the logged `source.groupId` from the
 * function logs (Dashboard → Edge Functions → line-webhook → Logs). Copy it
 * into the LINE_GROUP_ID secret and disable the webhook again — nothing else
 * ever calls this.
 *
 * Always answers 200 so LINE's verify button and event delivery both pass.
 */

Deno.serve(async (req) => {
  if (req.method === "POST") {
    const text = await req.text().catch(() => "");
    console.log("LINE webhook event:", text);
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
