
<script>
import { checkIsValidISCNId, checkIsValidNFTClassId } from '~/util/nft';

export default {
  fetch({ redirect, params: { id }, query }) {
    if (checkIsValidISCNId(id)) {
      redirect({ name: 'in-embed-nft-iscn-iscnId', params: { iscnId: id }, query });
    } else if (checkIsValidNFTClassId(id)) {
      redirect({ name: 'in-embed-nft-class-classId', params: { classId: id }, query });
    }
    redirect('/');
  },
}
</script>
