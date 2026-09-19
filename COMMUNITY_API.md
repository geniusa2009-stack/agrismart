# AgriSmart Community + Marketplace — API Surface

All routes below are mounted under `/api/v1` (same convention as the existing IoT API) and require
`Authorization: Bearer <accessToken>` unless noted. List endpoints accept `?page=&limit=` (default
`limit=20`, max `50`) and return `{ success, data, pagination }`.

## Community — `/community`

```
GET    /community/posts                       feed (filters: category, governorate, authorId)
POST   /community/posts                        create
GET    /community/posts/:postId                read
PATCH  /community/posts/:postId                edit (owner only)
DELETE /community/posts/:postId                soft-delete (owner only)
PATCH  /community/posts/:postId/moderate       hide/remove (staff only)

POST   /community/posts/:postId/comments       create
GET    /community/posts/:postId/comments       list
PATCH  /community/comments/:commentId          edit (owner only)
DELETE /community/comments/:commentId          soft-delete (owner only)
PATCH  /community/comments/:commentId/moderate hide/remove (staff only)

POST   /community/posts/:postId/reactions      toggle { type }

GET    /community/profile/me                   my profile
PATCH  /community/profile/me                   update my profile
GET    /community/profiles/:userId             public profile

POST   /community/follows/:userId              follow
DELETE /community/follows/:userId              unfollow
```

## Moderation — `/moderation`

```
POST   /moderation/reports                     file a report (any authenticated user)
GET    /moderation/reports                     queue (staff only)
PATCH  /moderation/reports/:reportId           resolve { status, resolutionNote } (staff only)
```

## Notifications — `/notifications`

```
GET    /notifications                          list (+ unreadCount)
PATCH  /notifications/:notificationId/read      mark one read
PATCH  /notifications/read-all                  mark all read
```

## Equipment — `/equipment`, `/rentals`

```
POST   /equipment                              create listing
GET    /equipment                              discover (filters: equipmentType, governorate, minPrice, maxPrice, condition, operatorAvailable)
GET    /equipment/mine                          my listings
GET    /equipment/:equipmentId                  read (must be active + visible)
GET    /equipment/:equipmentId/reviews          reviews for this listing
PATCH  /equipment/:equipmentId                  edit (owner only)
DELETE /equipment/:equipmentId                  archive (owner only)
PATCH  /equipment/:equipmentId/moderate         hide/remove (staff only)
POST   /equipment/:equipmentId/save             toggle bookmark
POST   /equipment/:equipmentId/rental-requests  create a rental request

GET    /rentals                                 my rentals (?as=owner|requester, ?status=)
PATCH  /rentals/:rentalId/status                 { action: accept|reject|cancel|complete }
POST   /rentals/:rentalId/review                 review (requester only, completed only)
```

## Agricultural services — `/services`, `/service-requests`

```
POST   /services                                create listing
GET    /services                                discover (filters: serviceType, governorate, minPrice, maxPrice)
GET    /services/mine                            my listings
GET    /services/:serviceId                      read
GET    /services/:serviceId/reviews              reviews for this listing
PATCH  /services/:serviceId                       edit (provider only)
DELETE /services/:serviceId                       archive (provider only)
PATCH  /services/:serviceId/moderate              hide/remove (staff only)
POST   /services/:serviceId/save                  toggle bookmark
POST   /services/:serviceId/requests               create a service request

GET    /service-requests                          my requests (?as=provider|requester, ?status=)
PATCH  /service-requests/:requestId/status         { action: accept|reject|start|complete|cancel }
POST   /service-requests/:requestId/review          review (requester only, completed only)
```

## Marketplace — `/marketplace`

```
POST   /marketplace                             create listing
GET    /marketplace                              discover (filters: category, governorate, minPrice, maxPrice, availability)
GET    /marketplace/mine                          my listings
GET    /marketplace/saved                          my saved items (any target type)
GET    /marketplace/:listingId                     read
PATCH  /marketplace/:listingId                      edit (seller only)
DELETE /marketplace/:listingId                      archive (seller only)
PATCH  /marketplace/:listingId/moderate             hide/remove (staff only)
POST   /marketplace/:listingId/contact              contact the seller { message }
POST   /marketplace/:listingId/save                 toggle bookmark
```

## Response envelope

Success: `{ "success": true, "data": ..., "pagination"?: {...} }`
Error: `{ "success": false, "error": { "code", "message", "statusCode", "requestId", "details"? } }`
— identical shape to the existing IoT API's error handler (`middleware/errorHandler.js`), not a
new convention.
