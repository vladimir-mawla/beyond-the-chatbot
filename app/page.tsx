import { OrderDeskDemo } from "../components/order-desk/OrderDeskDemo";
import { progressLine } from "./milestones";

/**
 * The home page (plan section 6, M8; a handoff file, rewritten here, replacing the genesis placeholder). It owns no logic: it
 * renders the demo, and one footer line whose progress sentence is derived from `milestones.ts`, never typed here.
 */
export default function Home() {
  return (
    <main>
      <OrderDeskDemo />
      <footer className="site-footer">
        <p>{progressLine()}</p>
        <p>
          Source and notes: <a href="https://github.com/vladimir-mawla/beyond-the-chatbot">github.com/vladimir-mawla/beyond-the-chatbot</a>
        </p>
      </footer>
    </main>
  );
}
