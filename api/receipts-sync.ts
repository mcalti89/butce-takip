import local from "../server/budget/receipt-maintenance";
import { withNasBackend } from "../server/nas/remote";
export default withNasBackend(local);
