import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_ACCESS_TOKEN = process.env.TMDB_ACCESS_TOKEN;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_BASE_URL_V4 = 'https://api.themoviedb.org/4';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342';

const useTmdbV4 = !!TMDB_ACCESS_TOKEN;

const FALLBACK_SEARCH_RESULTS = [
    { id: 1, title: 'Breaking Bad', poster: 'https://image.tmdb.org/t/p/w342/ggFHVNu6YYI5L9pCfOacjizRGt.jpg', year: '2008', rating: '9.5', description: 'A high school chemistry teacher turned methamphetamine producer...', genres: [18, 80] },
    { id: 2, title: 'The Office', poster: 'https://image.tmdb.org/t/p/w342/qWnJzyZhyy74gjpSjIXWmuk0ifX.jpg', year: '2005', rating: '8.8', description: 'A mockumentary on a group of typical office workers...', genres: [35] },
    { id: 3, title: 'Stranger Things', poster: 'https://image.tmdb.org/t/p/w342/x2LSRK2Cm7MZhjluni1msVJ3wDF.jpg', year: '2016', rating: '8.7', description: 'When a young boy vanishes, a small town uncovers a mystery...', genres: [18, 9648, 10765] },
    { id: 4, title: 'The Mandalorian', poster: 'https://image.tmdb.org/t/p/w342/sWgBv7LV2PRoQgkxwlibdGXKz1S.jpg', year: '2019', rating: '8.7', description: 'A lone gunfighter makes his way through the outer reaches...', genres: [10765, 12, 878] },
    { id: 5, title: 'Spider-Man: Into the Spider-Verse', poster: 'https://image.tmdb.org/t/p/w342/iiZZdoQBEYBv6id8kYg1ZHZs76V.jpg', year: '2018', rating: '8.4', description: 'Teen Miles Morales becomes Spider-Man of his reality...', genres: [12, 16, 878] }
];

/**
 * Search for movies/shows
 * Query params: q (search query), genre (genre ID), type (movie|tv|both)
 */
router.get('/', async (req, res) => {
    try {
        const { q, genre, type = 'both' } = req.query;

        if (!q || q.trim().length < 2) {
            return res.status(400).json({ error: 'Search query required (min 2 chars)' });
        }

        let results = [];

        if (!TMDB_API_KEY && !TMDB_ACCESS_TOKEN) {
            // Use fallback when no API credentials available
            const lowerQuery = q.trim().toLowerCase();
            results = FALLBACK_SEARCH_RESULTS.filter(item =>
                item.title.toLowerCase().includes(lowerQuery) ||
                item.description.toLowerCase().includes(lowerQuery) ||
                (item.year && item.year.includes(lowerQuery))
            );
        } else {
            // Search TMDB (v3 or v4)
            try {
                let response;
                if (useTmdbV4) {
                    const searchType = type === 'tv' ? 'tv' : type === 'movie' ? 'movie' : 'both';

                    const v4Search = async (endpoint) => {
                        const response = await axios.get(`${TMDB_BASE_URL_V4}${endpoint}`, {
                            params: {
                                query: q,
                                page: 1
                            },
                            headers: {
                                'Authorization': `Bearer ${TMDB_ACCESS_TOKEN}`,
                                'Content-Type': 'application/json;charset=utf-8'
                            }
                        });
                        return response.data.results || [];
                    };

                    if (searchType === 'both') {
                        const [movieResults, tvResults] = await Promise.all([
                            v4Search('/search/movie'),
                            v4Search('/search/tv')
                        ]);
                        response = { data: { results: [...movieResults, ...tvResults] } };
                    } else {
                        const endpoint = `/search/${searchType}`;
                        response = await axios.get(`${TMDB_BASE_URL_V4}${endpoint}`, {
                            params: {
                                query: q,
                                page: 1
                            },
                            headers: {
                                'Authorization': `Bearer ${TMDB_ACCESS_TOKEN}`,
                                'Content-Type': 'application/json;charset=utf-8'
                            }
                        });
                    }
                } else {
                    // Use v3 API with API key
                    const searchEndpoint = type === 'tv' ? '/search/tv' : 
                                          type === 'movie' ? '/search/movie' : '/search/multi';
                    response = await axios.get(`${TMDB_BASE_URL}${searchEndpoint}`, {
                        params: {
                            api_key: TMDB_API_KEY,
                            query: q,
                            page: 1
                        }
                    });
                }

                // Transform results
                results = response.data.results
                    .slice(0, 20)
                    .map(item => ({
                        id: item.id,
                        title: item.title || item.name,
                        poster: item.poster_path ? `${TMDB_IMAGE_BASE}${item.poster_path}` : 'https://via.placeholder.com/342x513?text=No+Image',
                        year: (item.release_date || item.first_air_date || '').split('-')[0],
                        rating: item.vote_average ? item.vote_average.toFixed(1) : 'N/A',
                        description: item.overview || 'No description available',
                        type: item.media_type || item.media_type === 'movie' || item.media_type === 'tv' ? item.media_type : 'unknown',
                        genres: item.genre_ids || []
                    }));
            } catch (tmdbError) {
                console.error('TMDB API error:', tmdbError.message);
                results = [];
            }
        }

        // Filter by genre if provided
        if (genre) {
            results = results.filter(item => item.genres.includes(parseInt(genre)));
        }

        res.json({ 
            results,
            total: results.length
        });

    } catch (error) {
        console.error('Search error:', error.message);
        res.status(500).json({ 
            error: 'Search failed',
            ...(process.env.NODE_ENV === 'development' && { details: error.message })
        });
    }
});

/**
 * Get movie/show details
 */
router.get('/details/:contentId', async (req, res) => {
    try {
        const { contentId } = req.params;

        let response;
        if (useTmdbV4) {
            response = await axios.get(`${TMDB_BASE_URL_V4}/find/${contentId}`, {
                params: { external_source: 'imdb_id' },
                headers: {
                    'Authorization': `Bearer ${TMDB_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json;charset=utf-8'
                }
            });
        } else {
            const { type = 'multi' } = req.query;
            const endpoint = type === 'tv' ? `/tv/${contentId}` :
                            type === 'movie' ? `/movie/${contentId}` : `/${contentId}`;
            response = await axios.get(`${TMDB_BASE_URL}${endpoint}`, {
                params: { api_key: TMDB_API_KEY }
            });
        }

        const item = response.data;
        const details = {
            id: item.id,
            title: item.title || item.name,
            description: item.overview,
            poster: item.poster_path ? `${TMDB_IMAGE_BASE}${item.poster_path}` : null,
            backdrop: item.backdrop_path ? `${TMDB_IMAGE_BASE}${item.backdrop_path}` : null,
            rating: item.vote_average ? item.vote_average.toFixed(1) : 'N/A',
            releaseDate: item.release_date || item.first_air_date,
            genres: item.genres ? item.genres.map(g => g.name) : [],
            runtime: item.runtime || item.episode_run_time?.[0],
            language: item.original_language,
            popularity: item.popularity
        };

        res.json(details);

    } catch (error) {
        console.error('Details error:', error.message);
        res.status(500).json({ error: 'Failed to fetch details' });
    }
});

/**
 * Get trending content
 */
router.get('/trending', async (req, res) => {
    try {
        const { type = 'movie', timeWindow = 'day' } = req.query;

        let response;
        if (useTmdbV4) {
            const trendingType = type === 'tv' ? 'tv' : 'movie';
            response = await axios.get(`${TMDB_BASE_URL_V4}/trending/${trendingType}/${timeWindow}`, {
                headers: {
                    'Authorization': `Bearer ${TMDB_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json;charset=utf-8'
                }
            });
        } else {
            response = await axios.get(
                `${TMDB_BASE_URL}/trending/${type}/${timeWindow}`,
                { params: { api_key: TMDB_API_KEY } }
            );
        }

        const results = response.data.results
            .filter(item => item.poster_path)
            .slice(0, 15)
            .map(item => ({
                id: item.id,
                title: item.title || item.name,
                poster: `${TMDB_IMAGE_BASE}${item.poster_path}`,
                rating: item.vote_average ? item.vote_average.toFixed(1) : 'N/A',
                popularity: item.popularity
            }));

        res.json({ results });

    } catch (error) {
        console.error('Trending error:', error.message);
        res.status(500).json({ error: 'Failed to fetch trending' });
    }
});

export default router;
