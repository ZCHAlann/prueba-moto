import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { getVehicleCockpit } from '../../services/vehiculo.service';
import { AppError } from '../../lib/errors';

const router = Router();

router.get('/:assetId',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const assetId = String(req.params.assetId);
      const companyId = `company-${req.companyId}`;
      if (!req.companyId) return next(new AppError(400, 'companyId requerido'));
      const data = await getVehicleCockpit(assetId, companyId);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
);

export default router;