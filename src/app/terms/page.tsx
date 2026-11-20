import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { operator } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of Use" };

export default function Terms() {
  const op = operator();
  return (
    <LegalPage title="Terms of Use" updated="November 20, 2026">
      <p>Spawnswap helps Roblox developers get their games played and lets players discover new games. By creating an account you agree to these terms.</p>

      <h2>Who can use Spawnswap</h2>
      <ul>
        <li>You must be at least 13 years old.</li>
        <li>If you are under 18, a parent or guardian must agree to these terms and make any purchase for you.</li>
        <li>One person, one account, one linked Roblox account.</li>
      </ul>

      <h2>Not affiliated with Roblox</h2>
      <p>Spawnswap is an independent service. It is not made, endorsed or sponsored by Roblox Corporation. You must also follow the Roblox Terms of Use, including on the games you list here.</p>

      <h2>Credits</h2>
      <ul>
        <li>One credit brings one player who plays your game for at least 10 minutes. Leaving a rating is optional.</li>
        <li>You earn credits by playing other games for 10 minutes, or you buy them. Ratings are optional, and must be honest.</li>
        <li>Credits have no cash value, can&apos;t be transferred or exchanged for Robux or money, and don&apos;t expire.</li>
        <li>Credits reserved for a campaign come back to you if you stop it before they are used.</li>
        <li>Invite bonus: a friend who joins with your link gets 5 credits, and you get 5 when they finish their first verified play on someone else&apos;s game. Their Roblox account must be at least 30 days old, and you can collect the bonus up to 50 times. Inviting yourself or alt accounts voids the bonus.</li>
      </ul>

      <h2>Fair play</h2>
      <p>To keep players real, these are not allowed and can lead to removing credits or closing the account:</p>
      <ul>
        <li>Alt accounts, bots, scripts or anything that fakes playtime or reviews.</li>
        <li>Changing the playtime check script to report players who did not play.</li>
        <li>Paying or rewarding people outside Spawnswap to play through it.</li>
        <li>Copy-paste, spam or abusive ratings or feedback, and trading or buying ratings.</li>
      </ul>

      <h2>Your games and trailers</h2>
      <ul>
        <li>Only add games you own or are allowed to promote.</li>
        <li>Trailers must show the real game and be content you have the right to use.</li>
        <li>Games and trailers must be suitable for all ages and follow Roblox community standards. We may remove anything that isn&apos;t.</li>
        <li>You let us show your game&apos;s name, icon and trailer on Spawnswap to promote it.</li>
        <li>Ratings, feedback and comments are public. Developers can delete comments on their own games, and we may remove anything that breaks these rules.</li>
      </ul>

      <h2>Creators and video requests</h2>
      <ul>
        <li>On the Social media tab, developers and creators (people who make TikTok or YouTube videos) can send each other video requests.</li>
        <li>You must be 18 or older to list yourself as a creator. Information on your creator card, like your follower count, must be true.</li>
        <li>When a request is accepted, we share both sides&apos; email addresses with each other so you can talk.</li>
        <li>Price, payment and delivery are agreed directly between the developer and the creator. Spawnswap is not part of that deal, doesn&apos;t handle the money and isn&apos;t responsible if one side doesn&apos;t deliver or pay.</li>
        <li>Paid or free-in-exchange videos must be clearly marked as ads (for example #ad or the platform&apos;s paid partnership label), and must follow the platform&apos;s rules and the Roblox Terms of Use.</li>
        <li>No spam requests. We may hide cards or posts and limit accounts that misuse this.</li>
      </ul>

      <h2>Purchases</h2>
      <ul>
        <li>Prices are shown in US dollars before you pay. Payments are processed by {op.payments}.</li>
        <li>Pro and Max are monthly subscriptions. They renew automatically each month at the price shown until you cancel. You can cancel any time in Plan &amp; billing; the plan stays until the end of the paid month, then your account goes back to Free. Your games and credits stay.</li>
        <li>Paid plans give visibility and tools (spotlight days, placement, badges, stats). They don&apos;t include players or credits: every player comes from credits earned by playing. Spotlight days refill monthly and don&apos;t carry over.</li>
        <li>We may change plan prices with at least 14 days&apos; notice by email before your next renewal.</li>
        <li>Credit packs bought in the past: unused packs can be refunded within 14 days of purchase if none of the credits have been used. See the <Link href="/refund">refund policy</Link> for the details.</li>
        <li>A homepage spotlight that has already started can&apos;t be refunded.</li>
      </ul>

      <h2>Closing accounts</h2>
      <ul>
        <li>You can delete your account at any time in Account settings, or ask us to do it.</li>
        <li>We may suspend or close an account that breaks these terms, and remove credits that were earned by cheating. Credits you bought and haven&apos;t used are refunded unless they were bought to cheat.</li>
      </ul>

      <h2>No guarantees</h2>
      <p>We verify playtime and reviews, but we can&apos;t promise how many players will stay, spend or come back. The service is provided as it is, and our responsibility is limited to the amount you paid us in the last 12 months.</p>

      <h2>Law</h2>
      <p>These terms are governed by the laws of {op.country ?? "the country where Spawnswap's operator lives"}. If you live in another country, you keep the consumer rights its law gives you.</p>

      <h2>Changes</h2>
      <p>We may update these terms. If a change matters, we&apos;ll tell you on the site before it takes effect.</p>
    </LegalPage>
  );
}
