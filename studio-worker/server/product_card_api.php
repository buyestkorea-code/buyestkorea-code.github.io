<?php
// Read-only: 상품명 텍스트(여러 줄) -> BUYEST 상품 조회 -> 카드 렌더링용 데이터 반환.
// 이미지는 브라우저 캔버스 캡처(CORS taint 방지)를 위해 서버가 파일을 읽어 data URI로 내려준다.

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }

$_SERVER['SERVER_PORT'] = $_SERVER['SERVER_PORT'] ?? '443';
$_SERVER['SERVER_NAME'] = $_SERVER['SERVER_NAME'] ?? 'buyest.co.kr';
require_once('/web/buyest/www/config.php');
require_once(MAX_LIB.'/lib_encode.php');
require_once(MAX_DATA.'/dbinfo.php');
$conn = max_connect($db_info['host'], $db_info['id'], $db_info['pw'], $db_info['name']);

const PRODUCT_IMG_DIR = '/web/buyest/www/data/product/';
const MAX_LINES = 30;
const MAX_CANDIDATES = 6;

$in = json_decode(file_get_contents('php://input'), true);
$lines = is_array($in['lines'] ?? null) ? $in['lines'] : [];
$lines = array_slice(array_values(array_filter(array_map('trim', $lines), fn($l) => $l !== '')), 0, MAX_LINES);

function like_escape($conn, $s) {
	$s = mysqli_real_escape_string($conn, $s);
	return str_replace(['%', '_'], ['\\%', '\\_'], $s);
}

// 상품명은 [시즌] [한글 설명...] [영문/숫자 품번...] — 끝에서부터 한글 없는 토큰 구간이 품번.
function code_suffix($line) {
	$tokens = preg_split('/\s+/u', trim($line));
	$out = [];
	for ($i = count($tokens) - 1; $i >= 0; $i--) {
		if (preg_match('/\p{Hangul}/u', $tokens[$i])) break;
		array_unshift($out, $tokens[$i]);
	}
	return implode(' ', $out);
}

function image_data_uri($file) {
	if (!preg_match('/^[A-Za-z0-9._-]+$/', $file)) return null;
	foreach ([PRODUCT_IMG_DIR . 'thumb-600X600-' . $file, PRODUCT_IMG_DIR . $file] as $path) {
		if (is_file($path) && filesize($path) < 4 * 1024 * 1024) {
			return 'data:image/jpeg;base64,' . base64_encode(file_get_contents($path));
		}
	}
	return null;
}

function fetch_candidates($conn, $where) {
	$sql = "SELECT p.pid, p.product_name, p.product_sprice, p.product_origin, p.product_config_point,
	               p.product_display, p.product_empty, p.product_img_detail, p.product_img_list, b.brand_name
	        FROM max_product p LEFT JOIN max_brand b ON b.bid = p.product_brand
	        WHERE {$where} ORDER BY p.pid DESC LIMIT " . MAX_CANDIDATES;
	$rows = [];
	$res = max_query($sql);
	while ($r = max_assoc($res)) $rows[] = $r;
	return $rows;
}

function shape($r) {
	$price = (int)$r['product_sprice'];
	$img = $r['product_img_detail'] !== '' ? $r['product_img_detail'] : $r['product_img_list'];
	return [
		'pid' => (int)$r['pid'],
		'name' => $r['product_name'],
		'brand' => $r['brand_name'],
		'price' => $price,
		'origin' => $r['product_origin'],
		'point' => $r['product_config_point'] === 'Y' ? (int)floor($price * 0.01) : 0,
		'display' => $r['product_display'],
		'product_empty' => $r['product_empty'], // 주의: 'N' = 품절, 'Y' = 판매중 (컬럼명과 반대)
		'image' => $img !== '' ? image_data_uri($img) : null,
	];
}

$results = [];
foreach ($lines as $line) {
	// Studio detail links use the exact public product ID.
	if (preg_match('~^https?://~i', $line)) {
		$u = parse_url($line);
		$q = [];
		parse_str($u['query'] ?? '', $q);
		$pid = $q['pid'] ?? '';
		$valid = ($u['scheme'] ?? '') === 'https' && ($u['host'] ?? '') === 'buyest.co.kr'
			&& ($u['path'] ?? '') === '/product_detail.php' && !isset($u['user']) && !isset($u['pass'])
			&& is_string($pid) && preg_match('/^[0-9]{1,10}$/D', $pid);
		$rows = $valid ? fetch_candidates($conn, "p.pid = " . (int)$pid . " AND p.product_display = 'Y'") : [];
		$results[] = ['query'=>$line, 'code'=>'', 'how'=>'pid', 'status'=>count($rows) ? 'one' : 'none', 'matches'=>array_map('shape', $rows)];
		continue;
	}
	$code = code_suffix($line);
	$exclude = "p.product_name NOT LIKE '%하자%' AND p.product_name NOT LIKE '%스크래치%'";
	$rows = [];
	if (mb_strlen($code) >= 3) {
		$rows = fetch_candidates($conn, "p.product_name LIKE '%" . like_escape($conn, $code) . "' AND {$exclude}");
	}
	$how = 'code';
	if (!$rows) {
		$how = 'text';
		$rows = fetch_candidates($conn, "p.product_name LIKE '%" . like_escape($conn, $line) . "%' AND {$exclude}");
	}
	// 입력과 상품명이 완전히 같은 게 있으면 그것 하나로 확정
	$exact = array_values(array_filter($rows, fn($r) => preg_replace('/\s+/u', ' ', $r['product_name']) === preg_replace('/\s+/u', ' ', $line)));
	if ($exact) $rows = [$exact[0]];
	$results[] = [
		'query' => $line,
		'code' => $code,
		'how' => $how,
		'status' => count($rows) === 0 ? 'none' : (count($rows) === 1 ? 'one' : 'multiple'),
		'matches' => array_map('shape', $rows),
	];
}

echo json_encode(['ok' => true, 'results' => $results], JSON_UNESCAPED_UNICODE);
