# NN Instagram

An Instagram feed integration app, built the Near Native way.

## Overview

NN Instagram is a Shopify app that syncs your Instagram Business feed and stores it as native Shopify metaobjects and files. This approach ensures:

- **Data ownership**: All Instagram posts are stored in the merchant's shop, accessible via the Shopify Admin
- **Liquid accessibility**: Posts can be queried and displayed directly in theme templates using Liquid
- **Design flexibility**: No widget limitations - style your Instagram feed however you want
- **Performance**: Images uploaded to Shopify Files CDN for fast loading
- **Portability**: Data stays in Shopify's standard format, no vendor lock-in

## Scope and Goals

The app offers seamless Instagram integration where:

- Posts are stored in `nn_instagram_post` metaobjects
- Feed configuration is stored in `nn_instagram_list` metaobjects
- Images and videos are uploaded to Shopify Files for CDN delivery
- Manual sync keeps content up-to-date
- OAuth with Instagram Business API ensures secure, long-lived access

## Technical Stack

- **Framework**: React Router v7.9.3
- **Database**: Prisma + PostgreSQL (Prisma Accelerate)
- **Language**: TypeScript
- **UI**: Shopify Polaris
- **API**: Instagram Business API
- **Deployment**: Vercel
- **Based on**: [Shopify App Template - React Router](https://github.com/Shopify/shopify-app-template-react-router)

## Installation & Setup

### 1. Install the App

Install NN Instagram from the Shopify App Store or via your partner dashboard.

### 2. Connect Your Instagram Account

1. Open the app from **Apps > NN Instagram** in your Shopify admin
2. Click **Connect Instagram Account**
3. Log in with your Instagram Business or Creator account
4. Authorize the app to access your Instagram Business account
5. You'll be redirected back to the dashboard

### 3. Sync Your Feed

1. Click **Sync Instagram Posts** to import your Instagram content
2. The app will:
   - Fetch your recent posts from Instagram
   - Upload images/videos to Shopify Files
   - Create metaobjects for each post
   - Store captions, likes, and comment counts

### 4. Add Feed to Your Theme

The app includes a **Theme App Extension block** that you can add to any page:

1. Go to **Online Store > Themes** in your Shopify admin
2. Click **Customize** on your active theme
3. Navigate to any page (homepage, product page, etc.)
4. Click **Add block** or **Add section**
5. Look for **NN Instagram Feed** in the Apps section
6. Add the block and customize settings:
   - Number of posts to display (1-50)
   - Aspect ratio (portrait or square)
   - Border radius (0-48px)
   - Gap between posts (0-64px)
   - Padding (top/bottom, left/right)
   - Show/hide profile header
   - Show/hide Instagram handle

### 5. Customize the Display

Each setting is fully customizable:

- **Via Theme Editor**: Adjust all visual settings in real-time
- **Via Code**: Edit the Liquid file in `extensions/instagram-feed/blocks/instagram-carousel.liquid` for complete HTML/CSS control
- **Via Theme CSS**: Override styles using the `.nn-instagram-*` CSS classes

## Development

### Prerequisites

1. **Node.js**: ≥ 20.19 or ≥ 22.12 - [Download](https://nodejs.org/)
2. **Shopify Partner Account**: [Create an account](https://partners.shopify.com/signup)
3. **Test Store**: Set up a [development store](https://help.shopify.com/en/partners/dashboard/development-stores#create-a-development-store)
4. **Instagram Business Account**: Required for API access
5. **PostgreSQL Database**: For production (Prisma Accelerate recommended)

### Local Development

```shell
npm install
npm run setup  # Initialize Prisma
shopify app dev
```

Press **P** to open the URL to your app. Once you click install, you can start development.

## Usage

### Merchant Workflow

1. **Connect Instagram**
   - Authenticate with Instagram Business API
   - App receives a 60-day long-lived access token

2. **Sync Posts**
   - Manual sync imports recent posts
   - Images/videos uploaded to Shopify Files
   - Metaobjects created for each post
   - Engagement data (likes, comments) stored

3. **Configure Display**
   - Use the real-time preview in the dashboard
   - Adjust visual settings (layout, spacing, colors)
   - See changes instantly before applying to theme

4. **Add to Storefront**
   - Install app block via theme editor
   - Choose pages to display the feed
   - Customize per-page if needed

5. **Manage Connection**
   - Disconnect removes all synced data
   - Reconnect to sync again
   - Data is fully portable (stored in Shopify)

### Displaying Instagram Feed in Liquid

Access Instagram post data directly in your theme templates:

#### Display Instagram Grid

```liquid
{% assign instagram_list = shop.metaobjects.nn_instagram_list.values | first %}

{% if instagram_list %}
  {% assign instagram_posts = instagram_list.posts.value %}

  <div class="instagram-feed">
    <h2>Follow us on Instagram</h2>

    <div class="instagram-grid">
      {% for post_ref in instagram_posts limit: 12 %}
        {% assign post = post_ref %}
        {% assign post_data = post.data.value | parse_json %}

        <div class="instagram-post">
          {% if post.images.value.size > 0 %}
            {% assign first_image = post.images.value.first %}
            <img
              src="{{ first_image | image_url: width: 600 }}"
              alt="{{ post.caption.value | truncate: 100 }}"
              loading="lazy"
            >
          {% endif %}

          <div class="instagram-overlay">
            {% if post.likes.value %}
              <span class="likes">❤️ {{ post.likes.value }}</span>
            {% endif %}
            {% if post.comments.value %}
              <span class="comments">💬 {{ post.comments.value }}</span>
            {% endif %}
          </div>
        </div>
      {% endfor %}
    </div>
  </div>
{% endif %}
```

#### Display Single Post

```liquid
{% assign instagram_list = shop.metaobjects.nn_instagram_list.values | first %}
{% if instagram_list %}
  {% assign latest_post = instagram_list.posts.value.first %}
  {% assign post_data = latest_post.data.value | parse_json %}

  <div class="featured-instagram">
    <h3>Latest from Instagram</h3>

    {% if latest_post.images.value.size > 0 %}
      <img
        src="{{ latest_post.images.value.first | image_url: width: 800 }}"
        alt="Instagram post"
      >
    {% endif %}

    {% if latest_post.caption.value %}
      <p>{{ latest_post.caption.value | truncate: 200 }}</p>
    {% endif %}

    <div class="engagement">
      <span>❤️ {{ latest_post.likes.value }} likes</span>
      <span>💬 {{ latest_post.comments.value }} comments</span>
    </div>
  </div>
{% endif %}
```

#### Check Connection Status

```liquid
{% assign instagram_list = shop.metaobjects.nn_instagram_list.values | first %}

{% if instagram_list %}
  <p>Connected to Instagram ✓</p>
{% else %}
  <p>No Instagram feed connected</p>
{% endif %}
```

## Data Structure

### Instagram Post Metaobject (nn_instagram_post)

Each Instagram post is stored as a metaobject with the following fields:

| Field    | Type                | Required | Description                                 |
| -------- | ------------------- | -------- | ------------------------------------------- |
| data     | JSON                | Yes      | Full Instagram post data (raw API response) |
| images   | File Reference List | No       | Uploaded images/videos from the post        |
| caption  | Multi-line Text     | No       | Instagram post caption                      |
| likes    | Number (Integer)    | No       | Number of likes                             |
| comments | Number (Integer)    | No       | Number of comments                          |

**JSON Data Structure:**

The `data` field contains the raw Instagram API response, including:

- `id`: Instagram media ID
- `media_type`: "IMAGE", "VIDEO", or "CAROUSEL_ALBUM"
- `media_url`: Original Instagram media URL
- `permalink`: Link to post on Instagram
- `timestamp`: Publication timestamp
- `username`: Instagram username

### Instagram List Metaobject (nn_instagram_list)

A single list metaobject stores the feed configuration:

| Field | Type                      | Required | Description                          |
| ----- | ------------------------- | -------- | ------------------------------------ |
| data  | JSON                      | Yes      | Feed metadata and configuration      |
| posts | Metaobject Reference List | No       | List of nn_instagram_post references |

### Shopify Files

All images and videos are uploaded to **Shopify Files** for:

- CDN delivery (fast global loading)
- Shopify image transformations (automatic resizing, cropping)
- Theme compatibility
- No external dependencies

Access via `{{ file | image_url: width: 600 }}` in Liquid.

## Architecture

### Instagram Business API Integration

**OAuth Flow:**

1. User clicks "Connect Instagram Account"
2. Redirected to Instagram OAuth (`/instagram`)
3. Instagram authorization screen
4. Callback to `/instagram/callback` with auth code
5. Exchange code for short-lived token
6. Exchange short-lived for long-lived token (60 days)
7. Fetch Instagram Business Account ID
8. Store token in database

**API Scopes:**

- `instagram_business_basic` - Read profile and posts
- `instagram_business_manage_messages` - Future messaging features
- `instagram_business_manage_comments` - Future comment moderation
- `instagram_business_content_publish` - Future content publishing
- `instagram_business_manage_insights` - Analytics and insights

**Token Management:**

- Long-lived tokens valid for 60 days
- Stored securely in PostgreSQL via Prisma
- Automatic refresh planned for future versions

### Sync Process

**When user clicks "Sync Instagram Posts":**

1. Fetch posts from Instagram Business API:

   ```
   GET /me/media?fields=id,media_type,media_url,permalink,caption,timestamp,username,children
   ```

2. For carousel posts, fetch child media:

   ```
   GET /{media_id}/children?fields=media_type,media_url
   ```

3. Download images/videos from Instagram URLs

4. Upload to Shopify Files API:

   ```graphql
   mutation fileCreate($files: [FileCreateInput!]!) {
     fileCreate(files: $files)
   }
   ```

5. Create/update `nn_instagram_post` metaobjects:

   ```graphql
   mutation metaobjectUpsert(
     $handle: MetaobjectHandleInput!
     $metaobject: MetaobjectUpsertInput!
   ) {
     metaobjectUpsert(handle: $handle, metaobject: $metaobject)
   }
   ```

6. Update `nn_instagram_list` with post references

7. Return sync statistics to dashboard

### Database Schema

```prisma
model SocialAccount {
  id          String   @id @default(cuid())
  shop        String
  provider    String   // "instagram"
  accessToken String   // Long-lived Instagram token
  userId      String?  // Instagram Business Account ID
  expiresAt   DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([shop, provider])
  @@map("social_accounts")
}

model Session {
  id          String    @id
  shop        String
  state       String
  isOnline    Boolean   @default(false)
  scope       String?
  expires     DateTime?
  accessToken String
  userId      BigInt?
  firstName   String?
  lastName    String?
  email       String?
  accountOwner Boolean  @default(false)
  locale      String?
  collaborator Boolean? @default(false)
  emailVerified Boolean? @default(false)
}
```

### Webhooks

The app subscribes to Shopify webhooks:

- `app/uninstalled` - Clean up data on uninstall
- `app/scopes_update` - Handle scope changes
- GDPR compliance webhooks:
  - `customers/data_request`
  - `customers/redact`
  - `shop/redact`

### App URLs

| Endpoint              | Method | Description                                   |
| --------------------- | ------ | --------------------------------------------- |
| `/app/_index`         | GET    | Initial setup, creates metaobject definitions |
| `/app/dashboard`      | GET    | Main dashboard UI                             |
| `/app/dashboard`      | POST   | Handle sync/disconnect actions                |
| `/instagram`          | GET    | Initiate Instagram OAuth                      |
| `/instagram/callback` | GET    | Handle OAuth callback                         |

## Customization Guide

### Full Control Over HTML/CSS

The Near Native approach gives you complete control over how the Instagram feed is displayed:

**1. Edit Block File Directly**

The theme block is a Liquid file you can edit:

- `extensions/instagram-feed/blocks/instagram-carousel.liquid`

Modify the HTML structure, add custom Liquid logic, or completely redesign the layout.

**2. Override Styles in Your Theme**

The block uses namespaced CSS classes (`.nn-instagram-*`) that you can override in your theme's CSS:

```css
/* In your theme's CSS file */
.nn-instagram-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr); /* Custom grid */
  gap: 8px; /* Tighter spacing */
}

.nn-instagram-post {
  border-radius: 0; /* Square posts */
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.nn-instagram-post:hover {
  transform: scale(1.05);
  transition: transform 0.3s ease;
}
```

**3. Use Theme Settings**

The block has configurable settings in the theme editor:

- Posts limit (1-50)
- Aspect ratio (portrait/square)
- Border radius (0-48px)
- Gap between posts (0-64px)
- Padding controls
- Header visibility
- Handle display

**4. Build Completely Custom Implementations**

Access Instagram data directly in any Liquid file:

```liquid
{% assign instagram_list = shop.metaobjects.nn_instagram_list.values | first %}
{% assign posts = instagram_list.posts.value %}

<!-- Build your own custom layout -->
<div class="my-custom-instagram-slider">
  {% for post in posts %}
    <!-- Your custom HTML here -->
  {% endfor %}
</div>
```

### Example: Instagram Slider with Swiper.js

```liquid
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css">

<div class="swiper">
  <div class="swiper-wrapper">
    {% assign instagram_list = shop.metaobjects.nn_instagram_list.values | first %}
    {% for post_ref in instagram_list.posts.value limit: 20 %}
      {% assign post = post_ref %}

      <div class="swiper-slide">
        {% if post.images.value.size > 0 %}
          <img
            src="{{ post.images.value.first | image_url: width: 800 }}"
            alt="{{ post.caption.value | truncate: 100 }}"
          >
        {% endif %}

        <div class="post-caption">
          {{ post.caption.value | truncate: 150 }}
        </div>
      </div>
    {% endfor %}
  </div>

  <div class="swiper-pagination"></div>
  <div class="swiper-button-prev"></div>
  <div class="swiper-button-next"></div>
</div>

<script src="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js"></script>
<script>
  new Swiper('.swiper', {
    slidesPerView: 1,
    spaceBetween: 16,
    navigation: {
      nextEl: '.swiper-button-next',
      prevEl: '.swiper-button-prev',
    },
    pagination: {
      el: '.swiper-pagination',
    },
    breakpoints: {
      640: { slidesPerView: 2 },
      1024: { slidesPerView: 4 },
    },
  });
</script>
```

## Deployment

### Deploy to Vercel

The app is deployed on Vercel:

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

**Environment Variables:**

Configure in Vercel dashboard:

- `DATABASE_URL` - Prisma Accelerate connection string
- `SHOPIFY_API_KEY` - From Shopify Partner dashboard
- `SHOPIFY_API_SECRET` - From Shopify Partner dashboard
- `INSTAGRAM_APP_ID` - From Facebook Developers
- `INSTAGRAM_APP_SECRET` - From Facebook Developers
- `INSTAGRAM_REDIRECT_URI` - Your Vercel deployment URL + `/instagram/callback`
- `INSTA_SCOPES` - Instagram API scopes (comma-separated)

### Update Shopify App Configuration

After deploying:

```bash
# Update app URLs and deploy extensions
npm run deploy
```

This will:

- Update OAuth redirect URLs
- Register webhooks
- Deploy theme app extensions

## Testing Instructions

For complete testing guide, see [SHOPIFY_TESTING_INSTRUCTIONS.md](./SHOPIFY_TESTING_INSTRUCTIONS.md).

**Quick Test Checklist:**

- [ ] Install app on development store
- [ ] Connect Instagram Business account
- [ ] Sync Instagram posts successfully
- [ ] Verify posts in **Content → Metaobjects → NN Instagram Post**
- [ ] Verify images in **Content → Files**
- [ ] Add app block to theme
- [ ] Configure display settings in theme editor
- [ ] Preview storefront - feed displays correctly
- [ ] Test responsive design (mobile/desktop)
- [ ] Test disconnect functionality
- [ ] Verify all data is deleted after disconnect

## Troubleshooting

### Instagram OAuth Fails

**Issue**: OAuth redirects but doesn't complete

**Solutions:**

- Verify `INSTAGRAM_REDIRECT_URI` matches exactly in:
  - `.env` file
  - Facebook App settings
  - Shopify app configuration
- Ensure Instagram account is a Business or Creator account
- Check that all required scopes are approved in Facebook App Review

### Sync Returns No Posts

**Issue**: Sync completes but no posts appear

**Solutions:**

- Verify Instagram Business Account is connected (not personal account)
- Check that account has published posts
- Verify API permissions in Facebook App dashboard
- Check token expiration date in database

### Images Don't Load

**Issue**: Posts sync but images show broken

**Solutions:**

- Check Shopify Files in admin - images should be uploaded
- Verify `write_files` scope is granted
- Check network tab for CORS or CDN issues
- Try re-syncing to re-upload images

### App Block Doesn't Appear

**Issue**: Can't find app block in theme editor

**Solutions:**

- Run `npm run deploy` to deploy extensions
- Verify theme is OS 2.0 compatible
- Check `extensions/instagram-feed/blocks/instagram-carousel.liquid` exists
- Clear browser cache and refresh theme editor

### Token Expired

**Issue**: Sync fails with authentication error

**Solutions:**

- Disconnect and reconnect Instagram account
- Check `expiresAt` in `SocialAccount` table
- Tokens last 60 days - reconnect before expiration
- Future versions will auto-refresh tokens

## Future Plans

Planned features:

- **Automatic Token Refresh**: Auto-renew tokens before 60-day expiration
- **Scheduled Sync**: Background sync on a schedule (daily, weekly)
- **Hashtag Filtering**: Sync only posts with specific hashtags
- **Story Support**: Display Instagram Stories (24-hour availability)
- **Reel Support**: Enhanced video post display
- **Comment Display**: Show Instagram comments on posts
- **Multi-Account**: Support multiple Instagram accounts per store
- **Analytics**: Track which posts drive the most engagement

## About Near Native

The Near Native brand builds apps that are as close to native Shopify functionality as possible. Key principles:

- **Data storage**: Always in shop-owner-accessible systems (metafields/metaobjects)
- **External storage**: Kept to an absolute minimum (only OAuth tokens)
- **Design flexibility**: Data accessible through Liquid templates
- **Best practices**: Proper linking throughout objects for easy data access
- **Portability**: Merchants own their data, no vendor lock-in

## Resources

- [Instagram Business API Documentation](https://developers.facebook.com/docs/instagram-api)
- [Metaobjects Documentation](https://shopify.dev/docs/apps/build/custom-data/metaobjects)
- [Shopify Files API](https://shopify.dev/docs/api/admin-graphql/latest/mutations/fileCreate)
- [Liquid Documentation](https://shopify.dev/docs/api/liquid)
- [React Router Shopify App Docs](https://shopify.dev/docs/api/shopify-app-react-router)
- [Theme App Extensions](https://shopify.dev/docs/apps/online-store/theme-app-extensions)

## License

This project is proprietary software. All rights reserved.

## Author

**Mohamed Amezian**

- GitHub: [@mohamedamezian](https://github.com/mohamedamezian)
- App: [NN Instagram](https://nn-instagram.vercel.app)

---

**Built with ❤️ for Shopify merchants following Near Native principles**
