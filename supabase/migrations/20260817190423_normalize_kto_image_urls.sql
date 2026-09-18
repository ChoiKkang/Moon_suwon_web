UPDATE core.place_images
SET image_url = regexp_replace(
  image_url,
  '^http://tong\.visitkorea\.or\.kr/',
  'https://tong.visitkorea.or.kr/'
)
WHERE image_url LIKE 'http://tong.visitkorea.or.kr/%';
