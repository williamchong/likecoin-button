import {
  isCookieEnabled,
  getCookie,
  setCookie,
} from 'tiny-cookie';

import {
  LIKE_CO_HOSTNAME,
  LIKER_LAND_URL_BASE,
  MEDIUM_MEDIA_REGEX,
} from '@/constant';

import EmbedCreateWidgetButton from '~/components/embed/EmbedCreateWidgetButton';
import EmbedUserInfo from '~/components/embed/EmbedUserInfo';
import { setTrackerUser, logTrackerEvent } from '@/util/EventLogger';

import {
  apiPostLikeButton,
  apiPostSuperLike,
  apiGetUserMinById,
  apiGetLikeButtonTotalCount,
  apiGetLikeButtonMyStatus,
  apiGetLikeButtonSelfCount,
  apiGetSuperLikeMyStatus,
  apiGetMyBookmark,
  apiAddMyBookmark,
  apiDeleteMyBookmark,
  apiGetMyFollower,
  apiAddMyFollower,
  apiGetSupportingUserByID,
} from '~/util/api/api';

import { checkHasStorageAPIAccess, checkIsFirefoxStrictMode } from '~/util/client';
import { handleQueryStringInUrl } from '~/util/url';

const MAX_LIKE = 5;
const LIKE_STATS_WINDOW_NAME = 'LIKER_LIST_STATS_WINDOW';
const SUPER_LIKE_WINDOW_NAME = 'SUPER_LIKE_WINDOW';

const debounce = require('lodash.debounce');
const uuidv4 = require('uuid/v4');

const debouncedOnClick = debounce((that) => {
  /* eslint-disable no-param-reassign */
  const count = that.likeCount - that.likeSent;
  that.likeSent += count;
  if (count > 0) {
    apiPostLikeButton(
      that.id,
      count,
      {
        referrer: that.referrer,
        isCookieSupport: that.hasCookieSupport,
        ...that.apiMetadata,
      },
    );
  }
  that.totalLike += count;
  /* eslint-enable no-param-reassign */
}, 500);

export default {
  components: {
    EmbedCreateWidgetButton,
    EmbedUserInfo,
  },
  asyncData({
    params,
    error,
    query,
  }) {
    let amount;
    try {
      const parse = parseInt(params.amount, 10);
      if (parse && !Number.isNaN(parse)) amount = parse;
    } catch (e) {
      // no op;
    }

    const { id } = params;
    let { type = '' } = query;
    const { referrer = '' } = query;
    if (!type && referrer.match(MEDIUM_MEDIA_REGEX)) {
      type = 'medium';
    }

    return Promise.all([
      apiGetUserMinById(id),
    ]).then((res) => {
      const {
        displayName,
        avatar,
        isPreRegCivicLiker,
        isCivicLikerTrial,
        isSubscribedCivicLiker,
        civicLikerSince,
      } = res[0].data;

      return {
        id,
        displayName: displayName || id,
        avatar,
        isPreRegCivicLiker,
        isCivicLikerTrial,
        isSubscribedCivicLiker,
        civicLikerSince,
        amount,
      };
    }).catch((err) => {
      console.error(err); // eslint-disable-line no-console
      error({ statusCode: 404, message: '' });
    });
  },
  data() {
    return {
      isCreator: false,
      isLoggedIn: false,
      isSubscribed: false,
      isTrialSubscriber: false,
      civicLikerVersion: 0,

      like_count: 0,
      likeSent: 0,
      totalLike: 0,

      sessionId: uuidv4(),

      isSuperLiker: false,
      canSuperLike: false,
      hasSuperLiked: false,
      isJustSuperLiked: false,
      nextSuperLikeTime: -1,
      cooldownProgress: 0,
      hasClickCooldown: false,
      parentSuperLikeID: '',

      hasBookmarked: false,
      isLoadingBookmark: true,
      bookmarkID: undefined,

      hasFollowedCreator: false,
      isLoadingFollowStatus: false,

      supportingQuantity: 0,

      hasCookieSupport: false,
      hasStorageAPIAccess: false,

      hasUpdateUserSignInStatus: false,

      isRedirecting: false,
    };
  },
  computed: {
    urlReferrer() {
      const { query } = this.$route;
      let { referrer = '' } = query;
      if (referrer) {
        referrer = handleQueryStringInUrl(referrer);
      }
      return referrer;
    },
    buttonType() {
      const { query } = this.$route;
      const { type = '' } = query;
      return type;
    },
    integration() {
      const { query } = this.$route;
      const { integration = '' } = query;
      return integration;
    },
    documentReferrer() {
      if (!process.client) return '';
      let windowReferrer = '';
      try {
        if (window.opener) {
          windowReferrer = (window.opener.document || {}).referrer;
        }
      } catch (err) {
        // no op
      }
      return windowReferrer || document.referrer || '';
    },
    referrer() {
      return this.urlReferrer || '';
    },
    referrerQueryString() {
      const { id, referrer } = this;
      const referrerQuery = `${referrer ? `&referrer=${encodeURIComponent(referrer)}` : ''}`;
      return `?from=${encodeURIComponent(id)}${referrerQuery}&utm_source=button`;
    },

    signUpURL() {
      return `https://${LIKE_CO_HOSTNAME}/in/register${this.referrerQueryString}&register=1&is_popup=1`;
    },
    superLikeURL() {
      const amountPath = `${this.amount ? `/${this.amount}` : ''}`;
      return `https://${LIKE_CO_HOSTNAME}/${this.id}${amountPath}${this.referrerQueryString}`;
    },
    likeCount: {
      get() {
        return this.like_count;
      },
      set(value) {
        this.like_count = Math.min(MAX_LIKE, value);
      },
    },

    isMaxLike() {
      return this.likeCount >= MAX_LIKE;
    },
    timezoneString() {
      return ((new Date()).getTimezoneOffset() / -60).toString();
    },

    // UI Labels
    likeButtonLabel() {
      if (this.likeCount >= 5 && this.canSuperLike && this.cooldownProgress <= 0) {
        return this.$t('SuperLikeNow');
      }
      return this.$tc('LikeCountLabel', this.totalLike, { count: this.totalLike });
    },
    ctaButtonLabel() {
      return this.$t(`CTA.CivicLiker.${this.isSupportingCreator ? 'Subscribing' : 'Button'}`);
    },
    ctaButtonPreset() {
      return this.isSupportingCreator ? 'special' : 'default';
    },
    isCreatorCivicLiker() {
      return this.isCivicLikerTrial || this.isSubscribedCivicLiker;
    },
    isSupportingCreator() {
      return this.supportingQuantity > 0;
    },
    hintText() {
      if (!this.isLoggedIn) {
        return this.$t('HintLabel.SignIn');
      }
      if (this.isCreator) {
        if (this.cooldownProgress) {
          if (this.hasClickCooldown) {
            return this.$t('HintLabel.SuperLikedPleaseTryAgainLater');
          }
          if (this.hasSuperLiked) {
            return this.$t('HintLabel.SuperLikedFollowersWillSee');
          }
          return undefined;
        }
        if (this.canSuperLike) {
          return this.$t('HintLabel.CanSuperLikeOwn');
        }
        return this.$t('HintLabel.ToSuperLikeOwn');
      }
      if (this.likeCount < 5) {
        return this.$t('HintLabel.PleaseLike');
      }
      if (this.cooldownProgress) {
        if (this.hasClickCooldown) {
          return this.$t('HintLabel.SuperLikedPleaseTryAgainLater');
        }
        if (this.hasSuperLiked) {
          return this.$t('HintLabel.SuperLikedFollowersWillSee');
        }
        return undefined;
      }
      if (this.canSuperLike) {
        return this.$t('HintLabel.CanSuperLike');
      }
      return this.$t('HintLabel.ToSuperLike');
    },
    apiMetadata() {
      return {
        documentReferrer: this.documentReferrer,
        sessionID: this.sessionId,
        type: this.buttonType,
        integration: this.integration,
      };
    },

    creatorPortfolioURL() {
      let url = `${LIKER_LAND_URL_BASE}/${this.id}/civic?utm_source=button`;
      if (this.referrer) {
        url = `${url}&referrer=${encodeURIComponent(this.referrer)}`;
      }
      return url;
    },
  },
  methods: {
    async getIsCookieSupport() {
      let res = false;
      try {
        this.hasStorageAPIAccess = await checkHasStorageAPIAccess();
        // Cross-site Cookie randomly disappear in fx strict mode
        const isFirefoxStrictMode = checkIsFirefoxStrictMode();
        res = process.client
          && navigator.cookieEnabled
          && this.hasStorageAPIAccess
          && isCookieEnabled()
          && !isFirefoxStrictMode;
      } catch (err) {
        console.error(err);
        return false;
      }
      setCookie('likebutton_cookie', 1);
      return res;
    },
    getParentSuperLikeID() {
      if (!document.cookie || !isCookieEnabled()) return '';
      return getCookie('likebutton_superlike_id');
    },
    async updateSuperLikeStatus() {
      await apiGetSuperLikeMyStatus(this.timezoneString, this.referrer).then(({ data }) => {
        const {
          isSuperLiker,
          canSuperLike,
          lastSuperLikeInfos,
          nextSuperLikeTs,
          cooldown,
        } = data;
        this.isSuperLiker = isSuperLiker;
        this.canSuperLike = canSuperLike;
        // HACK: Assume if `hasSuperLiked` has set to `true`, don't override it as
        // `lastSuperLikeInfos` may return empty array even the Super Like action is success
        if (!this.hasSuperLiked) {
          this.hasSuperLiked = !!(lastSuperLikeInfos && lastSuperLikeInfos.length);
        }
        this.nextSuperLikeTime = nextSuperLikeTs;
        this.cooldownProgress = cooldown;
      });
    },
    async updateUserSignInStatus() {
      try {
        await Promise.all([
          apiGetLikeButtonMyStatus(
            this.id,
            {
              referrer: this.referrer,
              isCookieSupport: this.hasCookieSupport,
              ...this.apiMetadata,
            },
          )
            .then(async ({ data: myData }) => {
              const {
                liker,
                isSubscribed,
                isTrialSubscriber,
                serverCookieSupported,
                civicLikerVersion,
              } = myData;
              this.isLoggedIn = !!liker;
              this.isCreator = liker === this.id;
              this.isSubscribed = isSubscribed;
              this.isTrialSubscriber = isTrialSubscriber;
              this.civicLikerVersion = civicLikerVersion;
              if (this.hasCookieSupport && serverCookieSupported !== undefined) {
                this.hasCookieSupport = serverCookieSupported;
              }

              if (this.isLoggedIn) {
                if (this.$sentry) {
                  this.$sentry.configureScope((scope) => {
                    scope.setUser({ id: liker });
                  });
                }
                const promises = [
                  this.updateSuperLikeStatus(),
                  setTrackerUser({ user: liker }),
                  apiGetMyBookmark(this.referrer).then(({ data: bookmarkData }) => {
                    if (bookmarkData.id) {
                      this.bookmarkID = bookmarkData.id;
                      this.hasBookmarked = true;
                    }
                  }).catch(() => {}),
                  apiGetMyFollower(this.id).then(({ data: followData }) => {
                    this.hasFollowedCreator = followData && followData.isFollowed;
                  }).catch(() => {}),
                ];
                if (this.civicLikerVersion === 2) {
                  promises.push(apiGetSupportingUserByID(this.id)
                    .then(({ data: supportingData }) => {
                      const { quantity } = supportingData;
                      this.supportingQuantity = quantity;
                    }).catch(() => {}));
                }
                await Promise.all(promises);
              }
              this.isLoadingBookmark = false;
              this.isLoadingFollowStatus = false;
              return Promise.resolve;
            }),
          apiGetLikeButtonSelfCount(this.id, this.referrer).then(({ data: selfData }) => {
            const { count, liker } = selfData;
            if (!this.liker) {
              this.liker = liker;
              this.isLoggedIn = !!liker;
            }
            this.likeCount = count;
            this.likeSent = count;
          }),
          apiGetLikeButtonTotalCount(this.id, this.referrer).then(({ data: totalData }) => {
            const { total } = totalData;
            this.totalLike = total;
          }),
        ]);
      } catch (err) {
        console.error(err); // eslint-disable-line no-console
      } finally {
        this.hasUpdateUserSignInStatus = true;
      }
    },
    async toggleBookmark() {
      if (this.isLoadingBookmark) return;
      this.isLoadingBookmark = true;
      if (this.bookmarkID) {
        this.hasBookmarked = false;
        await apiDeleteMyBookmark(this.bookmarkID, this.apiMetadata).then(() => {
          this.bookmarkID = null;
        }).catch((err) => {
          // eslint-disable-next-line no-console
          console.error(err);
          this.hasBookmarked = true;
        });
      } else {
        this.hasBookmarked = true;
        await apiAddMyBookmark(this.referrer, this.apiMetadata).then(({ data: bookmarkData }) => {
          this.bookmarkID = bookmarkData.id;
        }).catch((err) => {
          // eslint-disable-next-line no-console
          console.error(err);
          this.hasBookmarked = false;
        });
      }
      this.isLoadingBookmark = false;
    },
    async toggleFollow() {
      // NOTE: Unfollow is disabled for current UX
      if (this.isLoadingFollowStatus || this.hasFollowedCreator) return;
      this.isLoadingFollowStatus = true;
      await apiAddMyFollower(this.id, this.apiMetadata).then(() => {
        this.hasFollowedCreator = true;
      }).catch((err) => {
        // eslint-disable-next-line no-console
        console.error(err);
        this.hasFollowedCreator = false;
      });
      this.isLoadingFollowStatus = false;
    },
    signUp(options = { isNewWindow: true }) {
      if (options.isNewWindow) {
        const w = window.open(
          this.signUpURL,
          'signup',
          'width=540,height=600,menubar=no,location=no,resizable=yes,scrollbars=yes,status=yes',
        );
        this.$root.$emit('openPopupNoticeOverlay', w);
      } else {
        window.location = `${this.signUpURL}&redirect=${encodeURIComponent(window.location.href)}`;
      }
      logTrackerEvent(this, 'LikeButtonFlow', 'triggerSignUpIn', 'triggerSignUpIn', 1);
    },

    like() {
      this.likeCount += 1;
      debouncedOnClick(this);
    },
    superLike() {
      window.open(
        this.superLikeURL,
        SUPER_LIKE_WINDOW_NAME,
        'menubar=no,location=no,width=600,height=768',
      );
    },
    async newSuperLike() {
      const { cooldownProgress } = this;
      this.hasSuperLiked = true;
      this.isJustSuperLiked = true;
      this.cooldownProgress = 1;
      await apiPostSuperLike(this.id, {
        referrer: this.referrer,
        tz: this.timezoneString,
        parentSuperLikeID: this.parentSuperLikeID,
        ...this.apiMetadata,
      }).catch(() => {
        this.hasSuperLiked = false;
        this.cooldownProgress = cooldownProgress;
      });
    },
    openLikeStats(options = { isNewWindow: true }) {
      const { id, referrer } = this;
      if (options.isNewWindow) {
        window.open(
          `/in/embed/${id}/list${this.referrerQueryString}`,
          LIKE_STATS_WINDOW_NAME,
          'menubar=no,location=no,width=576,height=768',
        );
      } else {
        this.$router.push({
          name: 'in-embed-id-list',
          params: { id },
          query: {
            referrer,
            show_back: '1',
          },
        });
      }
    },
    onClickCTAButton() {
      const url = this.isSupportingCreator
        ? `${LIKER_LAND_URL_BASE}/${this.id}?civic_welcome=1`
        : `${LIKER_LAND_URL_BASE}/${this.id}/civic${this.referrerQueryString}`;
      window.open(
        url,
        '_blank',
        'menubar=no,location=no,width=527,height=700',
      );
    },
    onClickCooldown() {
      this.hasClickCooldown = true;
    },
    goToPortfolio({
      type = 'popup',
      target = '_blank',
      feature = '',
    } = {}) {
      const url = this.creatorPortfolioURL;
      if (type === 'popup') {
        window.open(url, target, feature);
      } else {
        this.isRedirecting = true;
        window.location.href = url;
      }
    },
  },
};
