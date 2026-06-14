import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342';

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

        // Search TMDB
        const searchEndpoint = type === 'tv' ? '/search/tv' : 
                              type === 'movie' ? '/search/movie' : '/search/multi';

        const response = await axios.get(`${TMDB_BASE_URL}${searchEndpoint}`, {
            params: {
                api_key: TMDB_API_KEY,
                query: q,
                page: 1
            }
        });

        // Transform results
        const results = response.data.results
            .filter(item => item.poster_path) // Only items with posters
            .slice(0, 20) // Limit to 20 results
            .map(item => ({
                id: item.id,
                title: item.title || item.name,
                poster: `${TMDB_IMAGE_BASE}${item.poster_path}`,
                year: (item.release_date || item.first_air_date || '').split('-')[0],
                rating: item.vote_average ? item.vote_average.toFixed(1) : 'N/A',
                description: item.overview,
                type: item.media_type || 'unknown',
                genres: item.genre_ids || []
            }));

        // Filter by genre if provided
        let filteredResults = results;
        if (genre) {
            filteredResults = results.filter(item => 
                item.genres.includes(parseInt(genre))
            );
        }

        res.json({ 
            results: filteredResults,
            total: filteredResults.length
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
        const { type = 'multi' } = req.query;

        const endpoint = type === 'tv' ? `/tv/${contentId}` :
                        type === 'movie' ? `/movie/${contentId}` : `/multi/${contentId}`;

        const response = await axios.get(`${TMDB_BASE_URL}${endpoint}`, {
            params: { api_key: TMDB_API_KEY }
        });

        const item = response.data;
        const details = {
            id: item.id,
            title: item.title || item.name,
            description: item.overview,
            poster: `${TMDB_IMAGE_BASE}${item.poster_path}`,
            backdrop: `${TMDB_IMAGE_BASE}${item.backdrop_path}`,
            rating: item.vote_average.toFixed(1),
            releaseDate: item.release_date || item.first_air_date,
            genres: item.genres.map(g => g.name),
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

        const response = await axios.get(
            `${TMDB_BASE_URL}/trending/${type}/${timeWindow}`,
            { params: { api_key: TMDB_API_KEY } }
        );

        const results = response.data.results
            .filter(item => item.poster_path)
            .slice(0, 15)
            .map(item => ({
                id: item.id,
                title: item.title || item.name,
                poster: `${TMDB_IMAGE_BASE}${item.poster_path}`,
                rating: item.vote_average.toFixed(1),
                popularity: item.popularity
            }));

        res.json({ results });

    } catch (error) {
        console.error('Trending error:', error.message);
        res.status(500).json({ error: 'Failed to fetch trending' });
    }
});

export default router;
