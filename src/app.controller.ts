import { Controller, Get, Res, Req } from '@nestjs/common';
import { AppService } from './app.service';
import { Response, Request } from 'express';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('/')
  getIndex(@Res() res: Response) {
    const filePath = join(__dirname, '..', 'public', 'index.html');
    if (existsSync(filePath)) {
      res.type('text/html').send(readFileSync(filePath));
    } else {
      res.status(404).send('index.html not found');
    }
  }

  @Get('/public/*')
  getStatic(@Req() req: Request, @Res() res: Response) {
    const filePath = join(__dirname, '..', req.url);
    if (existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).send('File not found');
    }
  }

  @Get('/favicon.ico')
  getFavicon(@Res() res: Response) {
    res.status(204).send(); // No content for favicon
  }
}